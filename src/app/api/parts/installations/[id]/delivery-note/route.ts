/**
 * POST /api/parts/installations/[id]/delivery-note
 *
 * 部品装着レコードに納品書画像をアップロードする。画像を assets バケットに保存し、
 * part_installation_evidence (kind=delivery_note) として追記する。opt-in テナントでは
 * レスポンス後に `after()` で AI-OCR + 三方照合 (parts.auto_reconcile_delivery_note) を
 * 自動実行する (findings に記録)。
 *
 * 確定署名・アンカー・在庫計上には関与しない (人の操作のまま)。手動の即時照合は
 * 従来どおり `POST /api/parts/installations/[id]/reconcile` (base64 直送) を使える。
 */
import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiError,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages"; // 共有 "assets" バケット
import { hashSha256 } from "@/lib/anchoring/imageHashing";
import { maybeAutoReconcileDeliveryNote } from "@/lib/ai/automation/partsReconcileAuto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

/** 納品書 OCR がサポートする 4 種のみ許可 (deliveryNoteOcr の ImageMediaType と一致)。 */
function detectMime(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id: installationId } = await ctx.params;
    if (!installationId) return apiNotFound("installation id is required");

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // 装着レコードが自テナントのものか確認 (TOCTOU 耐性: 後続も tenant_id で絞る)。
    const { data: inst } = await admin
      .from("part_installations")
      .select("id, status")
      .eq("id", installationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inst) return apiNotFound("installation not found");
    // 完全凍結 (確定済み) / 取消後は証拠追記しない。
    if (inst.status === "customer_verified" || inst.status === "voided") {
      return apiValidationError("確定済み / 取消済みの装着には納品書を追加できません。");
    }

    const form = await req.formData();
    const file = form.get("delivery_note");
    if (!(file instanceof File) || file.size === 0) {
      return apiValidationError("納品書ファイル (delivery_note) が必要です。");
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`ファイルサイズが大きすぎます (上限 ${MAX_FILE_BYTES / 1024 / 1024}MB)。`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = detectMime(buffer);
    if (!mime) {
      return apiValidationError("対応していないファイル形式です (JPEG・PNG・WebP・GIF のみ)。");
    }

    const sha256 = hashSha256(buffer);
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const storagePath = `parts/${tenantId}/${installationId}/delivery-note-${Date.now()}.${ext}`;

    const { error: upErr } = await admin.storage
      .from(CERTIFICATE_IMAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: mime, upsert: false });
    if (upErr) {
      return apiError({ code: "internal_error", message: `保存に失敗しました: ${upErr.message}`, status: 500 });
    }

    const { data: evidence, error: evErr } = await admin
      .from("part_installation_evidence")
      .insert({
        tenant_id: tenantId,
        installation_id: installationId,
        kind: "delivery_note",
        storage_path: storagePath,
        content_type: mime,
        sha256,
      })
      .select("id")
      .single();
    if (evErr) {
      // 証拠行が作れなければアップロード済みオブジェクトを掃除 (孤児防止)。
      admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .remove([storagePath])
        .catch(() => {});
      return apiInternalError(evErr, "parts/delivery-note evidence insert");
    }

    // opt-in テナントでは、アップロード後に AI-OCR + 三方照合を自動実行 (fire-and-forget)。
    after(() =>
      maybeAutoReconcileDeliveryNote({
        tenantId,
        installationId,
        evidenceId: evidence.id as string,
      }),
    );

    return apiJson({ ok: true, evidence_id: evidence.id }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/installations/[id]/delivery-note POST");
  }
}
