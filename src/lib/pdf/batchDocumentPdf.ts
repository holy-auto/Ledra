/**
 * 帳票一括 PDF (Batch document PDF) generation.
 *
 * Fetches multiple documents for a single tenant and renders each to PDF,
 * bundling the results into a ZIP. The single-document equivalent lives in
 * `src/app/admin/documents/pdf/route.ts`; this module reuses the same
 * tenant / customer / layout resolution so output is byte-identical.
 *
 * @security `tenantId` MUST already be verified by the caller
 *   (`resolveCallerWithRole`). `createTenantScopedAdmin` bypasses RLS, so every
 *   query is pinned with `.eq("tenant_id", tenantId)`.
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "@/lib/pdfDocument";
import { layoutConfigSchema, type LayoutConfig } from "@/types/documentTemplate";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createTenantScopedAdmin>["admin"];

/** Resolve the layout override for a document (template_id → doc-type default → tenant default). */
async function resolveLayoutForDoc(
  admin: Admin,
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

/** A single rendered document, ready to be written into the ZIP. */
export type RenderedDocPdf = { filename: string; data: Uint8Array };

/**
 * Render every requested document to PDF.
 *
 * Documents are filtered to `tenantId`. Unknown / cross-tenant ids are silently
 * skipped (the caller is expected to have already validated ownership, but this
 * defends in depth). Filenames are de-duplicated so two documents that share a
 * `doc_number` don't collide inside the archive.
 */
export async function renderTenantDocumentPdfs(docIds: string[], tenantId: string): Promise<RenderedDocPdf[]> {
  const uniqueIds = Array.from(new Set(docIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const { admin } = createTenantScopedAdmin(tenantId);

  // Tenant info is identical across documents — fetch once.
  const { data: tenant } = await admin
    .from("tenants")
    .select(
      "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info, default_template_id",
    )
    .eq("id", tenantId)
    .single();
  if (!tenant) throw new Error("tenant_not_found");

  const { data: docs, error } = await admin.from("documents").select("*").in("id", uniqueIds).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);

  const rows = docs ?? [];
  if (rows.length === 0) return [];

  // Resolve customer names in one round-trip to avoid N+1.
  const customerIds = Array.from(
    new Set(rows.map((d) => (d as { customer_id: string | null }).customer_id).filter((v): v is string => !!v)),
  );
  const customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customers } = await admin
      .from("customers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .in("id", customerIds);
    for (const c of customers ?? []) {
      customerNameById.set((c as { id: string }).id, ((c as { name: string | null }).name ?? "") || "");
    }
  }

  // Preserve the caller-supplied order so the archive is deterministic.
  const byId = new Map(rows.map((d) => [(d as { id: string }).id, d]));

  const usedNames = new Set<string>();
  const out: RenderedDocPdf[] = [];

  for (const id of uniqueIds) {
    const doc = byId.get(id);
    if (!doc) continue;

    const customerId = (doc as { customer_id: string | null }).customer_id;
    const customerName = customerId ? (customerNameById.get(customerId) ?? null) : null;

    const layoutOverride = await resolveLayoutForDoc(
      admin,
      tenantId,
      (doc as { doc_type: string }).doc_type,
      (doc as { template_id: string | null }).template_id ?? null,
      tenant.default_template_id ?? null,
    );

    try {
      const pdf = await renderDocumentPdf(
        doc as unknown as DocForPdf,
        tenant as unknown as TenantForDocPdf,
        customerName,
        layoutOverride,
      );
      const baseName = ((doc as { doc_number: string | null }).doc_number || "document").replace(/[\\/:*?"<>|]/g, "_");
      out.push({ filename: dedupeName(`${baseName}.pdf`, usedNames), data: new Uint8Array(pdf) });
    } catch (e) {
      // One bad document shouldn't abort the whole batch.
      logger.warn("batchDocumentPdf: render failed for document", {
        documentId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}

/** Append " (n)" before the extension until the filename is unique within the archive. */
function dedupeName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let i = 2;
  let candidate = `${stem} (${i})${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${stem} (${i})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Render the requested documents and bundle them into a ZIP archive.
 *
 * Returns the ZIP bytes. Throws `no_documents` if nothing could be rendered
 * (so the caller can surface a 404 rather than ship an empty archive).
 */
export async function generateBatchDocumentZip(docIds: string[], tenantId: string): Promise<Uint8Array> {
  const rendered = await renderTenantDocumentPdfs(docIds, tenantId);
  if (rendered.length === 0) throw new Error("no_documents");

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const { filename, data } of rendered) {
    zip.file(filename, data);
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  return new Uint8Array(out);
}
