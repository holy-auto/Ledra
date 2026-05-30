/**
 * 帳票 (請求書 / 見積書) の PDF を生成し、顧客がアクセスできる署名付き URL を返す。
 *
 * 確定→自動送付 (documentAuto) から呼ばれ、メール / LINE に「実際の書類 (PDF)」を
 * 同梱できるようにする。管理者用の `/admin/documents/pdf` ルートと同じ
 * `renderDocumentPdf` を使い、生成した PDF を assets バケットに保存して
 * 期限付き署名 URL を払い出す (顧客は認証なしで一定期間だけ閲覧可能)。
 *
 * すべて best-effort: 失敗時は null を返し、呼び出し側は PDF なしで送付を続行する。
 */
import { createTenantScopedAdmin, createServiceRoleAdmin } from "@/lib/supabase/admin";
import { renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "@/lib/pdfDocument";
import { createSignedAssetUrl } from "@/lib/signedUrl";
import { layoutConfigSchema, type LayoutConfig } from "@/types/documentTemplate";
import { logger } from "@/lib/logger";

/** 既定の署名 URL 有効期間 (7 日)。請求書の支払い期限を踏まえ短すぎない値。 */
const DEFAULT_PDF_TTL_SECONDS = 7 * 24 * 3600;

/** 帳票に適用するレイアウト (テンプレート) を解決する。/admin/documents/pdf と同等。 */
async function resolveLayoutForDoc(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
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

/**
 * 帳票 PDF を生成して assets バケットに保存し、署名付き URL を返す。
 * 生成 / アップロード / 署名のいずれかに失敗したら null。
 */
export async function renderDocumentSignedPdfUrl(
  tenantId: string,
  documentId: string,
  expiresInSeconds: number = DEFAULT_PDF_TTL_SECONDS,
): Promise<string | null> {
  try {
    const { admin } = createTenantScopedAdmin(tenantId);

    const { data: doc, error } = await admin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !doc) return null;

    const { data: tenant } = await admin
      .from("tenants")
      .select(
        "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info, default_template_id",
      )
      .eq("id", tenantId)
      .single();
    if (!tenant) return null;

    let customerName: string | null = null;
    if (doc.customer_id) {
      const { data: cust } = await admin.from("customers").select("name").eq("id", doc.customer_id).single();
      customerName = cust?.name ?? null;
    }

    const layoutOverride = await resolveLayoutForDoc(
      admin,
      tenantId,
      doc.doc_type as string,
      (doc.template_id as string | null) ?? null,
      (tenant.default_template_id as string | null) ?? null,
    );

    const pdf = await renderDocumentPdf(
      doc as unknown as DocForPdf,
      tenant as unknown as TenantForDocPdf,
      customerName,
      layoutOverride,
    );

    const storage = createServiceRoleAdmin("auto-send document PDF — customer delivery, fire-and-forget");
    const storagePath = `documents/${tenantId}/${documentId}.pdf`;
    const { error: upErr } = await storage.storage
      .from("assets")
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      logger.warn("auto_send_document_pdf_upload_failed", { tenantId, documentId, error: upErr.message });
      return null;
    }

    return await createSignedAssetUrl(storagePath, expiresInSeconds);
  } catch (e) {
    logger.warn("auto_send_document_pdf_render_failed", {
      tenantId,
      documentId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
