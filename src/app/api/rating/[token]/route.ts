/**
 * GET  /api/rating/[token]
 * POST /api/rating/[token]
 *
 * 証明書発行の数日後に顧客へ送る評価依頼（IMP-029 rating_request）の回答受け口。
 * 顧客は token を持っているが Supabase 認証は無いため公開エンドポイント。テナント跨ぎを防ぐため
 * すべて certificate_rating_requests.token 経由で解決する（/api/signature/review/[token] と同じ形）。
 *
 * GET : 店名と回答済みかどうか（UI は /sign の ReviewPrompt を共用するので同じ応答形）
 * POST: rating + 任意 comment。`submitted_at IS NULL` 条件付き更新で1回だけ受け付ける（2回目は 409）
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const submitSchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1, "1 〜 5 の範囲で評価してください。")
    .max(5, "1 〜 5 の範囲で評価してください。"),
  comment: z
    .string()
    .trim()
    .max(2000, "コメントは 2000 文字以内でお願いします。")
    .optional()
    .transform((v) => v || null),
});

const REASON = "public rating request flow — token-based, no auth session";

type RequestRow = {
  id: string;
  tenant_id: string;
  sent_at: string | null;
  rating: number | null;
  comment: string | null;
  submitted_at: string | null;
};

async function loadByToken(admin: ReturnType<typeof createServiceRoleAdmin>, token: string) {
  const { data, error } = await admin
    .from("certificate_rating_requests")
    .select("id, tenant_id, sent_at, rating, comment, submitted_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return (data as RequestRow | null) ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { token } = await params;
    const admin = createServiceRoleAdmin(REASON);
    const row = await loadByToken(admin, token);
    // 未送信の行はまだ顧客にリンクが渡っていないので、存在しないものとして扱う。
    if (!row?.sent_at) return apiNotFound("リンクが見つかりません");

    const { data: tenant } = await admin.from("tenants").select("name").eq("id", row.tenant_id).maybeSingle();
    return apiOk({
      tenant_name: (tenant?.name as string | null) ?? null,
      google_review_url: null,
      already_reviewed: !!row.submitted_at,
      review: row.submitted_at ? { rating: row.rating, comment: row.comment, google_redirected: false } : null,
      can_review: !row.submitted_at,
    });
  } catch (e) {
    return apiInternalError(e, "GET /api/rating/[token]");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const parsed = await parseJsonBody(req, submitSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { token } = await params;
    const admin = createServiceRoleAdmin(REASON);
    const row = await loadByToken(admin, token);
    if (!row?.sent_at) return apiNotFound("リンクが見つかりません");

    const { data: updated, error } = await admin
      .from("certificate_rating_requests")
      .update({
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        submitted_at: new Date().toISOString(),
        ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
      })
      .eq("id", row.id)
      .is("submitted_at", null)
      .select("id");
    if (error) throw error;
    if (!updated?.length) {
      return apiError({ code: "conflict", message: "このリンクからは既に評価が送信されています。", status: 409 });
    }
    return apiOk({ id: row.id, google_review_url: null });
  } catch (e) {
    return apiInternalError(e, "POST /api/rating/[token]");
  }
}
