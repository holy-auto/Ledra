/**
 * POST /api/parts/installations/[id]/evidence
 *
 * 部品装着レコードに装着写真を 1 枚アップロードする（現場タブレットの「撮るだけ」経路）。
 * 画像を assets バケットに保存し、SHA-256 / 知覚ハッシュ / EXIF 撮影日時を付与して
 * part_installation_evidence に追記する。他装着との写真使い回しを検知して finding に記録する。
 *
 * 納品書 (kind=delivery_note) は OCR + 三方照合を伴う専用経路
 * (`.../delivery-note`) を使う。本経路は装着・文脈・旧品・封印・刻印等の写真用。
 *
 * 確定署名・アンカー・在庫計上には関与しない（人の操作のまま）。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { attachInstallationPhoto, INSTALL_PHOTO_KINDS, type InstallPhotoKind } from "@/lib/parts/evidenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

/** sharp / exifr が扱える代表的な画像のみ許可（マジックバイト判定）。 */
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

    const { id: installationId } = await ctx.params;
    if (!installationId) return apiNotFound("installation id is required");

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // 装着レコードが自テナントのものか確認（後続も tenant_id で絞る）。
    const { data: inst } = await admin
      .from("part_installations")
      .select("id, status")
      .eq("id", installationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!inst) return apiNotFound("installation not found");
    // 完全凍結（確定済み）/ 取消後は証拠追記しない。
    if (inst.status === "customer_verified" || inst.status === "voided") {
      return apiValidationError("確定済み / 取消済みの装着には写真を追加できません。");
    }

    const form = await req.formData();

    const kindRaw = String(form.get("kind") ?? "");
    if (!(INSTALL_PHOTO_KINDS as readonly string[]).includes(kindRaw)) {
      return apiValidationError(`kind は ${INSTALL_PHOTO_KINDS.join(" / ")} のいずれかを指定してください。`);
    }

    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return apiValidationError("写真ファイル (photo) が必要です。");
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`ファイルサイズが大きすぎます (上限 ${MAX_FILE_BYTES / 1024 / 1024}MB)。`);
    }

    const captureNonceRaw = form.get("capture_nonce");
    const captureNonce = typeof captureNonceRaw === "string" && captureNonceRaw ? captureNonceRaw.slice(0, 128) : null;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = detectMime(buffer);
    if (!mime) {
      return apiValidationError("対応していないファイル形式です (JPEG・PNG・WebP・GIF のみ)。");
    }

    const result = await attachInstallationPhoto({
      admin,
      tenantId,
      installationId,
      kind: kindRaw as InstallPhotoKind,
      buffer,
      arrayBuffer,
      mime,
      captureNonce,
    });

    return apiJson({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/installations/[id]/evidence POST");
  }
}
