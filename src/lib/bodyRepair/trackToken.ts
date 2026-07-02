import { randomBytes } from "crypto";
import type { createTenantScopedAdmin } from "@/lib/supabase/admin";

type TenantAdmin = ReturnType<typeof createTenantScopedAdmin>["admin"];

/** 顧客向け進捗トラッキングのベースパス（/track/[token]）。 */
export const TRACK_BASE_PATH = "/track";

/**
 * 車体整備案件の `track_token` を冪等に取得（無ければ発行）する。
 *
 * track-link route とステージ進捗の自動通知の両方から使う。複数タブ/リクエストが
 * 同時に発行しても、`is("track_token", null)` ガードで後勝ち上書きを防ぎ、既に配布した
 * URL を 404 化しない。案件が見つからない場合は null。
 */
export async function ensureBodyRepairTrackToken(
  admin: TenantAdmin,
  tenantId: string,
  jobId: string,
): Promise<string | null> {
  const { data: job } = await admin
    .from("body_repair_jobs")
    .select("track_token")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!job) return null;

  const existing = job.track_token as string | null;
  if (existing) return existing;

  const newToken = randomBytes(18).toString("base64url"); // 24-char opaque token
  const { data: updated } = await admin
    .from("body_repair_jobs")
    .update({ track_token: newToken, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .is("track_token", null)
    .select("track_token");

  if (updated && updated.length > 0) return newToken;

  // レースに負けた: 既に別リクエストがトークンを設定済み。その値を読み直す。
  const { data: reread } = await admin
    .from("body_repair_jobs")
    .select("track_token")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (reread?.track_token as string | null) ?? newToken;
}
