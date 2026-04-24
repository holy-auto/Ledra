/**
 * Ledra 電子署名 - 署名セッション管理
 *
 * signature_sessions テーブルの CRUD および
 * 期限切れ処理を担当するモジュール。
 */

import { randomUUID } from "crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { computeDocumentHash } from "./hash";
import type { CreateSignatureSessionInput, SignatureSession } from "./types";

/** 署名セッションの有効時間（環境変数で上書き可、デフォルト72時間） */
const EXPIRES_HOURS = Number(process.env.SIGNATURE_SESSION_EXPIRES_HOURS ?? 72);

// ============================================================
// セッション作成
// ============================================================

/**
 * 署名セッションを作成する。
 *
 * 処理内容:
 * 1. 署名対象 PDF の SHA-256 ハッシュ計算
 * 2. ワンタイムトークン（UUID v4）の生成
 * 3. signature_sessions テーブルへの挿入
 * 4. 監査ログ（'session_created'）の記録
 *
 * @param input - セッション作成入力
 * @returns 作成された SignatureSession
 * @throws DB エラー時
 */
export async function createSignatureSession(input: CreateSignatureSessionInput): Promise<SignatureSession> {
  const supabase = createServiceRoleAdmin("signature session — opaque token lookup for unauthenticated customer");

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
  const documentHash = computeDocumentHash(input.pdf_bytes);

  const { data, error } = await supabase
    .from("signature_sessions")
    .insert({
      certificate_id: input.certificate_id,
      tenant_id: input.tenant_id,
      created_by: input.created_by,
      token,
      expires_at: expiresAt,
      status: "pending",
      document_hash: documentHash,
      document_hash_alg: "SHA-256",
      signer_name: input.signer_name ?? null,
      signer_email: input.signer_email ?? null,
      signer_phone: input.signer_phone ?? null,
      notification_method: input.notification_method ?? "line",
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`[signature] Failed to create signature session: ${error?.message}`);
  }

  // 監査ログ: セッション作成
  await supabase.from("signature_audit_logs").insert({
    session_id: data.id,
    event: "session_created",
    metadata: {
      certificate_id: input.certificate_id,
      tenant_id: input.tenant_id,
      expires_at: expiresAt,
      document_hash: documentHash,
    },
  });

  return data as SignatureSession;
}

// ============================================================
// セッション取得・検証
// ============================================================

/**
 * トークンで有効な署名セッションを取得する。
 *
 * 以下の全条件を満たすセッションのみ返す:
 * - token が一致する
 * - status = 'pending'（未署名）
 * - expires_at が現在時刻より未来（有効期限内）
 *
 * @param token - ワンタイムトークン
 * @returns 有効なセッション、または null（無効・期限切れ・署名済み）
 */
export async function getValidSessionByToken(token: string): Promise<SignatureSession | null> {
  const supabase = createServiceRoleAdmin("signature session — opaque token lookup for unauthenticated customer");

  const { data, error } = await supabase
    .from("signature_sessions")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !data) return null;
  return data as SignatureSession;
}

/**
 * セッション ID でセッションを取得する。
 *
 * @param sessionId - セッション UUID
 * @returns SignatureSession または null
 */
export async function getSessionById(sessionId: string): Promise<SignatureSession | null> {
  const supabase = createServiceRoleAdmin("signature session — opaque token lookup for unauthenticated customer");

  const { data, error } = await supabase.from("signature_sessions").select("*").eq("id", sessionId).single();

  if (error || !data) return null;
  return data as SignatureSession;
}

/**
 * 証明書 ID に紐づく最新の有効セッションを返す。
 * 重複リクエスト防止のために使用する。
 *
 * @param certificateId - 証明書 UUID
 * @returns 有効な pending セッション、または null
 */
export async function getExistingPendingSession(certificateId: string): Promise<SignatureSession | null> {
  const supabase = createServiceRoleAdmin("signature session — opaque token lookup for unauthenticated customer");

  const { data, error } = await supabase
    .from("signature_sessions")
    .select("*")
    .eq("certificate_id", certificateId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as SignatureSession;
}

// ============================================================
// 期限切れ処理（Cron ジョブから呼び出し）
// ============================================================

/**
 * 期限切れの pending セッションを一括で 'expired' に更新する。
 *
 * 既存の Cron ジョブ（src/app/api/cron/）に追加して定期実行する。
 * 推奨実行間隔: 1時間ごと
 *
 * @returns 更新したセッション数
 */
export async function expireOldSessions(): Promise<number> {
  const supabase = createServiceRoleAdmin("signature session — opaque token lookup for unauthenticated customer");

  const { data, error } = await supabase
    .from("signature_sessions")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    throw new Error(`[signature] Failed to expire sessions: ${error.message}`);
  }

  // 各期限切れセッションに監査ログを記録
  if (data && data.length > 0) {
    await supabase.from("signature_audit_logs").insert(
      data.map((s: { id: string }) => ({
        session_id: s.id,
        event: "expired",
        metadata: { expired_at: new Date().toISOString() },
      })),
    );
  }

  return data?.length ?? 0;
}

// ============================================================
// セッションキャンセル
// ============================================================

/**
 * 指定した証明書の pending セッションをキャンセルする。
 * 新しい署名依頼を送り直す際などに使用する。
 *
 * @param certificateId - 証明書 UUID
 * @param reason        - キャンセル理由
 * @param cancelledBy   - キャンセルを実行したユーザー ID
 */
export async function cancelPendingSessions(certificateId: string, reason: string, cancelledBy: string): Promise<void> {
  const supabase = createServiceRoleAdmin("signature session — opaque token lookup for unauthenticated customer");

  const { data: sessions } = await supabase
    .from("signature_sessions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: reason,
    })
    .eq("certificate_id", certificateId)
    .eq("status", "pending")
    .select("id");

  if (sessions && sessions.length > 0) {
    await supabase.from("signature_audit_logs").insert(
      sessions.map((s: { id: string }) => ({
        session_id: s.id,
        event: "cancelled",
        metadata: {
          reason,
          cancelled_by: cancelledBy,
          cancelled_at: new Date().toISOString(),
        },
      })),
    );
  }
}
