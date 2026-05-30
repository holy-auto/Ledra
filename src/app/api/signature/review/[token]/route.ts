/**
 * POST /api/sign/[token]/review
 * GET  /api/sign/[token]/review
 *
 * 受領サイン (`/sign/[token]`) 完了直後に表示するレビュー収集フロー。
 * 顧客は token を持っているが Supabase 認証は無いため、公開エンドポイント。
 * tenant 跨ぎを防ぐためにすべての検証は signature_sessions.token 経由で行う。
 *
 * GET: テナントの google_review_url と既に提出済みかどうかを返す
 *      (UI が「投稿済み」表示を出し分けるため)
 * POST: rating + 任意 comment を受け取り signature_reviews に 1 行追加
 *       (signature_session_id に UNIQUE 制約があるので二重送信を防ぐ)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiError, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { logger } from "@/lib/logger";
import { maybeAutoAnalyzeReview } from "@/lib/ai/automation/reviewAuto";

export const dynamic = "force-dynamic";

const submitSchema = z.object({
  rating: z.coerce.number().int().min(1, "1 〜 5 の範囲で評価してください。").max(5),
  comment: z
    .string()
    .trim()
    .max(2000, "コメントは 2000 文字以内でお願いします。")
    .optional()
    .transform((v) => v ?? null),
  /** 高評価で Google レビューへ遷移した場合に true で送られる */
  google_redirected: z.boolean().optional(),
});

interface SessionRow {
  id: string;
  status: string;
  tenant_id: string;
  certificate_id: string;
}

async function loadSessionByToken(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  token: string,
): Promise<SessionRow | null> {
  const { data, error } = await admin
    .from("signature_sessions")
    .select("id, status, tenant_id, certificate_id")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  return data as SessionRow;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { token } = await params;
    if (!token) return apiValidationError("token is required");

    const admin = createServiceRoleAdmin("public review flow — token-based, no auth session");
    const session = await loadSessionByToken(admin, token);
    if (!session) return apiError({ code: "not_found", message: "リンクが見つかりません", status: 404 });

    // 既存レビュー有無
    const { data: existing } = await admin
      .from("signature_reviews")
      .select("id, rating, comment, google_redirected_at")
      .eq("signature_session_id", session.id)
      .maybeSingle();

    const { data: tenant } = await admin
      .from("tenants")
      .select("name, google_review_url")
      .eq("id", session.tenant_id)
      .maybeSingle();

    return apiOk({
      tenant_name: tenant?.name ?? null,
      google_review_url: tenant?.google_review_url ?? null,
      already_reviewed: !!existing,
      review: existing
        ? {
            rating: existing.rating as number,
            comment: (existing.comment as string | null) ?? null,
            google_redirected: !!existing.google_redirected_at,
          }
        : null,
      can_review: session.status === "signed",
    });
  } catch (e) {
    return apiInternalError(e, "sign review GET");
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  try {
    const { token } = await params;
    if (!token) return apiValidationError("token is required");

    const parsed = submitSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const admin = createServiceRoleAdmin("public review flow — token-based, no auth session");
    const session = await loadSessionByToken(admin, token);
    if (!session) return apiError({ code: "not_found", message: "リンクが見つかりません", status: 404 });

    // 署名済み (= sign フロー完了済み) でないとレビュー不可
    if (session.status !== "signed") {
      return apiValidationError("署名が完了していないためレビューを送信できません。");
    }

    // 顧客を certificate 経由で逆引き (任意、無くてもレビューは記録)
    const { data: cert } = await admin
      .from("certificates")
      .select("customer_id")
      .eq("id", session.certificate_id)
      .maybeSingle();
    const customerId = (cert?.customer_id as string | null) ?? null;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const ua = req.headers.get("user-agent") ?? "unknown";

    const { data: inserted, error: insertErr } = await admin
      .from("signature_reviews")
      .insert({
        tenant_id: session.tenant_id,
        signature_session_id: session.id,
        certificate_id: session.certificate_id,
        customer_id: customerId,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
        google_redirected_at: parsed.data.google_redirected ? new Date().toISOString() : null,
        ip,
        user_agent: ua,
      })
      .select("id")
      .single();

    if (insertErr) {
      // UNIQUE 違反 = 二重送信。クライアントには 409 で返す。
      const code = (insertErr as { code?: string }).code;
      if (code === "23505") {
        return apiError({
          code: "conflict",
          message: "このリンクからは既にレビューが送信されています。",
          status: 409,
        });
      }
      logger.warn("[sign/review] insert failed", { token: token.slice(0, 8), err: insertErr.message });
      return apiInternalError(insertErr, "sign review POST: insert");
    }

    // AI 自動解析 (review.auto_analyze が opt-in のテナントのみ実体が動く / 既定 OFF)。
    // 顧客向けレスポンスを遅らせないよう fire-and-forget。内部で fail-soft (throw しない)。
    if (parsed.data.comment) {
      void maybeAutoAnalyzeReview({
        tenantId: session.tenant_id,
        reviewId: (inserted?.id as string | undefined) ?? null,
        comment: parsed.data.comment,
      });
    }

    // 高評価で Google review URL がある場合は返す (4-5 星)
    const { data: tenant } = await admin
      .from("tenants")
      .select("google_review_url")
      .eq("id", session.tenant_id)
      .maybeSingle();
    const shouldOfferGoogle = parsed.data.rating >= 4 && !!tenant?.google_review_url;

    return apiOk({
      ok: true,
      id: inserted?.id as string | undefined,
      google_review_url: shouldOfferGoogle ? (tenant?.google_review_url as string) : null,
    });
  } catch (e) {
    return apiInternalError(e, "sign review POST");
  }
}
