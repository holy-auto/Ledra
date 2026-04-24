import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { renderInvoicePdf, type InvoiceForPdf, type TenantForPdf } from "@/lib/pdfInvoice";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { admin } = createTenantScopedAdmin(tenantId!);

  // Fetch invoice from documents table
  const { data: invoice, error } = await admin
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .single();
  if (error || !invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Fetch tenant info
  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info",
    )
    .eq("id", tenantId)
    .single();
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  // Fetch customer name
  let customerName: string | null = null;
  if (invoice.customer_id) {
    const { data: cust } = await admin.from("customers").select("name").eq("id", invoice.customer_id).single();
    customerName = cust?.name ?? null;
  }

  try {
    // Map documents columns to InvoiceForPdf shape
    const invoiceForPdf = {
      ...invoice,
      invoice_number: invoice.doc_number,
    };
    const pdf = await renderInvoicePdf(
      invoiceForPdf as unknown as InvoiceForPdf,
      tenant as unknown as TenantForPdf,
      customerName,
    );
    const body = new Uint8Array(pdf);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.doc_number || "invoice"}.pdf"`,
      },
    });
  } catch (e: unknown) {
    console.error("invoice pdf generation failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
