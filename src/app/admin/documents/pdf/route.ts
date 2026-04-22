import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDocumentPdf } from "@/lib/pdfDocument";
import { layoutConfigSchema, type LayoutConfig } from "@/types/documentTemplate";

export const dynamic = "force-dynamic";

async function resolveLayoutForDoc(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  docTypeFromDoc: string,
  templateIdFromDoc: string | null,
  tenantDefaultTemplateId: string | null,
): Promise<Partial<LayoutConfig> | undefined> {
  let templateId: string | null = templateIdFromDoc || null;

  if (!templateId) {
    const { data: typeDefault } = await admin
      .from("document_templates")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("doc_type", docTypeFromDoc)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    templateId = typeDefault?.id ?? null;
  }

  if (!templateId) templateId = tenantDefaultTemplateId;
  if (!templateId) return undefined;

  const { data: tpl } = await admin
    .from("document_templates")
    .select("layout_config")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!tpl?.layout_config) return undefined;

  const parsed = layoutConfigSchema.safeParse(tpl.layout_config);
  return parsed.success ? parsed.data : undefined;
}

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

  const admin = createAdminClient();

  const { data: doc, error } = await admin
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();
  if (error || !doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info, default_template_id",
    )
    .eq("id", tenantId)
    .single();
  if (!tenant) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  let customerName: string | null = null;
  if (doc.customer_id) {
    const { data: cust } = await admin.from("customers").select("name").eq("id", doc.customer_id).single();
    customerName = cust?.name ?? null;
  }

  const layoutOverride = await resolveLayoutForDoc(
    admin,
    tenantId,
    doc.doc_type,
    doc.template_id ?? null,
    tenant.default_template_id ?? null,
  );

  try {
    const pdf = await renderDocumentPdf(doc as any, tenant as any, customerName, layoutOverride);
    const body = new Uint8Array(pdf as any);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${doc.doc_number || "document"}.pdf"`,
      },
    });
  } catch (e: unknown) {
    console.error("document pdf generation failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
