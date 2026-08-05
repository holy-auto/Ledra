/**
 * 帳票 PDF を「顧客が開ける共有 URL」にするヘルパ。
 *
 * 帳票 PDF はオンザフライ生成で管理画面 (admin 認証必須) からしか取得できず、
 * 顧客が LINE / メール / SMS から開ける公開 URL が存在しなかった。ここで
 * PDF をレンダリングして非公開 Storage バケットに保存し、長期署名 URL を発行する
 * (画像送信 `storeOutboundImage` と同じ「private bucket + 署名 URL」モデル)。
 *
 * LINE Messaging API は生ファイル (PDF) を push できないため、共有は必ず URL 送付になる。
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { renderDocumentPdf, type DocForPdf, type TenantForDocPdf } from "@/lib/pdfDocument";
import { layoutConfigSchema, type LayoutConfig } from "@/types/documentTemplate";
import { LINE_MEDIA_BUCKET } from "@/lib/line/media";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createTenantScopedAdmin>["admin"];

/**
 * 帳票に適用するレイアウトを解決する。
 * 優先順: 帳票指定テンプレ → 帳票種別の既定テンプレ → テナント既定テンプレ → なし。
 *
 * PDF ルート (`/admin/documents/pdf`) と共有 URL 生成の双方から使うため lib に集約
 * (二重定義でレイアウトがズレるのを防ぐ)。
 */
export async function resolveLayoutForDoc(
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

/**
 * 帳票 PDF をレンダリングして Storage に保存し、長期署名 URL を返す。
 *
 * 共有時点のスナップショットを保存するので、後で帳票を編集しても「送った PDF」は
 * 変わらない (送付済み帳票は封印され不変なので実運用上も一致する)。
 *
 * @returns 署名 URL。生成・保存・署名のいずれかで失敗したら null (呼び出し側は
 *   PDF リンク無しで本文送信を続ける fail-soft を想定)。
 * ponytail: 保存先は既存の `line-media` バケットを再利用 (private + 署名 URL の
 *   モデルが同一で、新規バケット/マイグレーション不要)。専用バケットに分けたく
 *   なったら path prefix `documents/` ごと移すのが upgrade path。
 */
export async function renderAndStoreDocumentPdf(tenantId: string, documentId: string): Promise<string | null> {
  try {
    const { admin } = createTenantScopedAdmin(tenantId);

    const { data: doc, error } = await admin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .single();
    if (error || !doc) {
      logger.warn("[pdfShare] document not found", { tenantId, documentId, err: error?.message });
      return null;
    }

    const { data: tenant } = await admin
      .from("tenants")
      .select(
        "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info, default_template_id",
      )
      .eq("id", tenantId)
      .single();
    if (!tenant) {
      logger.warn("[pdfShare] tenant not found", { tenantId, documentId });
      return null;
    }

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

    const pdf = await renderDocumentPdf(
      doc as unknown as DocForPdf,
      tenant as unknown as TenantForDocPdf,
      customerName,
      layoutOverride,
    );
    const buf = new Uint8Array(pdf);

    const path = `${tenantId}/documents/${documentId}-${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await admin.storage.from(LINE_MEDIA_BUCKET).upload(path, buf, {
      contentType: "application/pdf",
    });
    if (upErr) {
      logger.warn("[pdfShare] upload failed", { tenantId, documentId, err: upErr.message });
      return null;
    }

    const TEN_YEARS_SEC = 10 * 365 * 24 * 60 * 60;
    const { data: signed, error: signErr } = await admin.storage
      .from(LINE_MEDIA_BUCKET)
      .createSignedUrl(path, TEN_YEARS_SEC);
    if (signErr || !signed?.signedUrl) {
      logger.warn("[pdfShare] sign failed", { tenantId, documentId, err: signErr?.message });
      return null;
    }

    return signed.signedUrl;
  } catch (e) {
    logger.warn("[pdfShare] renderAndStoreDocumentPdf threw", {
      tenantId,
      documentId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
