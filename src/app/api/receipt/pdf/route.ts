/**
 * POS レシートの公開 PDF。**認証なし**で、推測不能な public_id だけを鍵にする。
 *
 * Apple Tap to Pay 要件 5.10「決済後にレシートを SMS / Email で送れること」のため。
 * モバイルの共有ダイアログが送る /receipt/[public_id] から、この PDF に降りてくる。
 *
 * **doc_type = 'receipt' 以外は必ず 404。**そのガードは findPublicReceipt()
 * （src/lib/receipts/publicReceipt.ts）に1箇所だけ置いてある。ここには書かない。
 * documents には請求書・見積書・発注書も同居しているので、ガードが漏れると
 * public_id が付いた瞬間にそれらが公開される。回帰テストは __tests__/route.test.ts。
 *
 * 描画は既存の renderDocumentPdf() を使う。あれは DOC_TYPE_LABELS.receipt = "領収書"
 * を持っていて最初から領収書に対応している。
 */
import { NextResponse } from "next/server";

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { findPublicReceipt } from "@/lib/receipts/publicReceipt";
import { renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "@/lib/pdfDocument";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = getClientIp(req);
  const rl = await checkRateLimit(`receipt-pdf:${ip}`, { limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "リクエストが多すぎます。しばらくしてから再度お試しください。" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const publicId = (new URL(req.url).searchParams.get("rid") ?? "").trim();
  if (!publicId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const admin = createServiceRoleAdmin("public receipt pdf — lookup by public_id, anonymous caller");

  // doc_type='receipt' のガードは findPublicReceipt() の中。**ここには書かない。**
  // 存在しない public_id と「領収書ではない」を区別しない。どちらも 404。
  const doc = await findPublicReceipt(admin, publicId);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info",
    )
    .eq("id", doc.tenant_id as string)
    .single();
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let customerName: string | null = null;
  const docNumber = typeof doc.doc_number === "string" ? doc.doc_number : "";
  if (doc.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("name")
      .eq("id", doc.customer_id as string)
      .maybeSingle();
    customerName = cust?.name ?? null;
  }

  try {
    const pdf = await renderDocumentPdf(
      doc as unknown as DocForPdf,
      tenant as unknown as TenantForDocPdf,
      customerName,
    );
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${docNumber || "receipt"}.pdf"`,
        // 公開URLだが検索エンジンには載せない
        "x-robots-tag": "noindex",
      },
    });
  } catch (e: unknown) {
    logger.error("receipt pdf generation failed", {
      publicId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
