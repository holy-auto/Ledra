/**
 * 店舗用登録リンクの公開エンドポイント.
 *
 * - GET  /api/intake/link/:short_id?t=<token>
 *     リンクを検証し、店舗名など表示に必要な最小情報を返す (tenant_id は返さない).
 * - POST /api/intake/link/:short_id
 *     「登録をはじめる」操作. その都度 1 回限りの intake 招待を mint し、
 *     既存の公開フォーム /intake/:short_id へ誘導する URL を返す.
 *
 * 公開フローのため IP rate limit 必須.
 */
import { NextRequest } from "next/server";
import { apiOk, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { validateStoreLink, mintInvitationFromLink } from "@/lib/identity/intakeLinkServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ short_id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const { short_id } = await ctx.params;
  const rawToken = req.nextUrl.searchParams.get("t");
  if (!rawToken) return apiValidationError("token (t) は必須です");

  const link = await validateStoreLink(short_id, rawToken);
  if (!link || !link.isActive) return apiNotFound("リンクが見つかりません");

  return apiOk({
    store_name: link.storeName,
    label: link.label,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ short_id: string }> }) {
  // mint は intake 招待を作るので書込み系として厳しめに制限する
  const limited = await checkRateLimit(req, "sensitive");
  if (limited) return limited;

  const { short_id } = await ctx.params;
  const rawToken = req.nextUrl.searchParams.get("t");
  if (!rawToken) return apiValidationError("token (t) は必須です");

  const link = await validateStoreLink(short_id, rawToken);
  if (!link || !link.isActive) return apiNotFound("リンクが見つかりません");

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  try {
    const minted = await mintInvitationFromLink(link, baseUrl);
    // 既存の公開フォームへ誘導 (絶対 URL の path 部分のみを返す)
    return apiOk({ intake_path: `/intake/${minted.shortId}?t=${minted.rawToken}` });
  } catch (err) {
    return apiInternalError(err, "POST /api/intake/link/[short_id]");
  }
}
