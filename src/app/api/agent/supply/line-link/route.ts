/**
 * メーカーが LINE 通知用の連携コードを発行する。
 * 発行したコードを Ledra 公式 LINE 公式アカウントへ送ると line_user_id が紐付く。
 */
import { NextResponse } from "next/server";
import { apiJson, apiInternalError } from "@/lib/api/response";
import { requireActiveSupplyPartner } from "@/lib/supply/partnerContext";
import { generateSupplyPartnerLinkCode } from "@/lib/supply/lineLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const gate = await requireActiveSupplyPartner({ allowPending: true });
    if (gate instanceof NextResponse) return gate;

    const { code, expiresAt } = await generateSupplyPartnerLinkCode(gate.partnerId);
    const addUrl = (process.env.NEXT_PUBLIC_LEDRA_PARTNER_LINE_ADD_URL ?? "").trim() || null;
    return apiJson({ ok: true, code, expires_at: expiresAt, add_url: addUrl });
  } catch (e: unknown) {
    return apiInternalError(e, "supply line-link generate");
  }
}
