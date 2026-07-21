/**
 * 重要操作の WebAuthn ゲート。finalize/void/訂正 等の実行直前に呼び、フラグに応じて
 * 操作署名(operation/verify で記録済みの assertion)を要求する。
 *
 * 単回利用: チャレンジをここで atomically 消費する(operation/verify では消費しない)。
 * 二重確定など同一署名の使い回しを、チャレンジ消費の競合で防ぐ。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { operationSigningMode } from "@/lib/webauthn/config";
import type { OperationType } from "@/lib/webauthn/operation";

export type OperationAssurance = "not_required" | "password_only" | "passkey";

export interface OperationGateResult {
  ok: boolean;
  assurance: OperationAssurance;
  reason?: string;
  assertionId?: string;
}

export async function requireOperationAssertion(
  admin: SupabaseClient,
  args: {
    userId: string;
    tenantId: string;
    operationType: OperationType;
    certificateId: string;
    /** operation/verify のレスポンスで得た challenge_id。 */
    challengeId?: string | null;
  },
): Promise<OperationGateResult> {
  const mode = operationSigningMode();
  if (mode === "off") return { ok: true, assurance: "not_required" };

  // 認証器の登録有無で optional/enforce を分岐。
  const { count } = await admin
    .from("operator_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId)
    .eq("is_active", true);
  const hasCredential = (count ?? 0) > 0;

  if (!hasCredential) {
    if (mode === "optional") return { ok: true, assurance: "password_only" };
    return { ok: false, assurance: "password_only", reason: "この操作には認証器(パスキー)の登録が必要です。" };
  }

  if (!args.challengeId) {
    return { ok: false, assurance: "passkey", reason: "操作署名がありません。パスキーで承認してください。" };
  }

  // チャレンジを atomically 消費(未使用・本人・同一 op/cert のみ)。競合時は 0 件更新=拒否。
  const { data: consumed } = await admin
    .from("webauthn_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", args.challengeId)
    .eq("user_id", args.userId)
    .eq("tenant_id", args.tenantId)
    .eq("purpose", "authentication")
    .eq("operation_type", args.operationType)
    .eq("certificate_id", args.certificateId)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!consumed) {
    return { ok: false, assurance: "passkey", reason: "有効な操作署名がありません(未署名・使用済み・対象不一致)。" };
  }

  // 消費したチャレンジに紐づく検証済み assertion を確認。
  const { data: assertion } = await admin
    .from("webauthn_assertions")
    .select("id")
    .eq("challenge_id", args.challengeId)
    .eq("user_verified", true)
    .limit(1)
    .maybeSingle();
  if (!assertion) {
    return { ok: false, assurance: "passkey", reason: "操作署名の記録が見つかりません。" };
  }

  return { ok: true, assurance: "passkey", assertionId: assertion.id as string };
}
