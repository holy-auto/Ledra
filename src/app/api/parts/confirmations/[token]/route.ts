/**
 * GET /api/parts/confirmations/[token] — 確定セッション情報（顧客・未認証）。
 *
 * 顧客が自分の携帯で開く確定ページ用。署名対象（装着内容）の要約と状態を返す。
 * 不透明トークンで service-role 引き（既存署名フローと同方針）。
 */

import { apiJson, apiInternalError } from "@/lib/api/response";
import { getConfirmationContext } from "@/lib/parts/confirmationService";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const ctx = await getConfirmationContext(token);
    if (!ctx) return apiJson({ error: "not_found" }, { status: 404 });
    return apiJson({
      status: ctx.status,
      channel: ctx.channel,
      expires_at: ctx.expiresAt,
      part: ctx.part,
    });
  } catch (e) {
    return apiInternalError(e, "parts/confirmations/[token] GET");
  }
}
