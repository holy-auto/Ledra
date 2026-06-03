/**
 * POST /api/parts/confirmations/[token]/sign — 顧客が内容を確認し電子署名（顧客・未認証）。
 *
 * サーバ鍵で署名＋RFC3161 TSA を付与し、装着を customer_verified に確定する。
 * 実際の確定可否は DB の完全凍結ゲートが最終判定する。
 */

import { apiJson, apiInternalError } from "@/lib/api/response";
import { getConfirmationContext, signConfirmation } from "@/lib/parts/confirmationService";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const ctx = await getConfirmationContext(token);
    if (!ctx) return apiJson({ error: "not_found" }, { status: 404 });

    const result = await signConfirmation(ctx.tenantId, token);
    if (!result.ok) return apiJson({ ok: false, reason: result.reason }, { status: 400 });
    return apiJson({ ok: true, installation_id: result.installationId });
  } catch (e) {
    return apiInternalError(e, "parts/confirmations/[token]/sign POST");
  }
}
