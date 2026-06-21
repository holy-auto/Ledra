/**
 * POST /api/admin/body-repair-jobs/[id]/track-link
 *
 * 車体整備案件の顧客向け進捗トラッキング URL を発行する (ガイドライン4.3 見える化)。
 * 既にトークンが発行済みなら再利用する (idempotent)。
 */

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRACK_BASE_PATH = "/track";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id: jobId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return apiValidationError("job_id が不正です");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: job, error: jobErr } = await admin
      .from("body_repair_jobs")
      .select("id, track_token")
      .eq("id", jobId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (jobErr) return apiInternalError(jobErr, "track-link fetch");
    if (!job) return apiError({ code: "not_found", message: "案件が見つかりません", status: 404 });

    let token = job.track_token as string | null;
    if (!token) {
      const newToken = randomBytes(18).toString("base64url"); // 24-char opaque token
      // 競合ガード: track_token が NULL のときだけ書き込む。複数タブ/管理者が同時に
      // 発行しても、後勝ちで上書きして既に配布した URL を 404 化しないようにする。
      const { data: updated, error: updErr } = await admin
        .from("body_repair_jobs")
        .update({ track_token: newToken, updated_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("tenant_id", caller.tenantId)
        .is("track_token", null)
        .select("track_token");
      if (updErr) return apiError({ code: "db_error", message: "トラッキングリンクの発行に失敗しました", status: 500 });

      if (updated && updated.length > 0) {
        token = newToken;
      } else {
        // レースに負けた: 既に別リクエストがトークンを設定済み。その値を読み直す。
        const { data: reread } = await admin
          .from("body_repair_jobs")
          .select("track_token")
          .eq("id", jobId)
          .eq("tenant_id", caller.tenantId)
          .maybeSingle();
        token = (reread?.track_token as string | null) ?? newToken;
      }
    }

    return apiOk({ track_url: `${TRACK_BASE_PATH}/${token}`, token });
  } catch (e) {
    return apiInternalError(e, "admin/body-repair-jobs/[id]/track-link");
  }
}
