import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { renderInvoicePdf, type InvoiceForPdf, type TenantForPdf } from "@/lib/pdfInvoice";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/orders/[id]/invoice-pdf
 * 受発注に紐づく請求書PDFを、当事者（発注元 from / 受注 to のいずれか）へ配信する。
 * 請求書の発行元は受注側 (to_tenant) なので、その documents 行を service-role で読み、
 * 呼び出し元が当事者であることを app 層で認可してからレンダリングする。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();

  const admin = createPlatformScopedAdmin(
    "orders/invoice-pdf: 受発注の当事者(from/to)へ請求書PDFを配信 (テナント跨ぎ読取・app層で当事者認可)",
  );

  const { data: order } = await admin
    .from("job_orders")
    .select("id, from_tenant_id, to_tenant_id")
    .eq("id", id)
    .single();
  if (!order) return apiNotFound("not_found");

  // 認可: 呼び出し元は受発注の当事者でなければならない。
  if (caller.tenantId !== order.from_tenant_id && caller.tenantId !== order.to_tenant_id) {
    return apiForbidden("この受発注の当事者ではありません");
  }

  const issuerTenantId = order.to_tenant_id as string | null;
  if (!issuerTenantId) return apiNotFound("no_invoice");

  const { data: invoice } = await admin
    .from("documents")
    .select("*")
    .eq("tenant_id", issuerTenantId)
    .eq("job_order_id", id)
    .eq("doc_type", "invoice")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!invoice) return apiNotFound("no_invoice");

  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info",
    )
    .eq("id", issuerTenantId)
    .single();
  if (!tenant) return apiNotFound("tenant_not_found");

  try {
    const pdf = await renderInvoicePdf(
      { ...invoice, invoice_number: invoice.doc_number } as unknown as InvoiceForPdf,
      tenant as unknown as TenantForPdf,
      (invoice.recipient_name as string | null) ?? null,
    );
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.doc_number || "invoice"}.pdf"`,
      },
    });
  } catch (e: unknown) {
    console.error("[orders/invoice-pdf] pdf generation failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
