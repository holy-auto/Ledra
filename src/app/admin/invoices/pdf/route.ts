import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderInvoicePdf } from "@/lib/pdfInvoice";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) return NextResponse.json({ error: "tenant_not_found" }, { status: 400 });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch invoice
  const { data: invoice, error } = await admin
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !invoice) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Fetch tenant info
  const { data: tenant } = await admin
    .from("tenants")
    .select("name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info")
    .eq("id", tenantId)
    .single();
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  // Fetch customer name
  let customerName: string | null = null;
  if (invoice.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("name")
      .eq("id", invoice.customer_id)
      .single();
    customerName = cust?.name ?? null;
  }

  try {
    const pdf = await renderInvoicePdf(invoice as any, tenant as any, customerName);
    const body = new Uint8Array(pdf as any);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.invoice_number || "invoice"}.pdf"`,
      },
    });
  } catch (e: any) {
    console.error("invoice pdf generation failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
