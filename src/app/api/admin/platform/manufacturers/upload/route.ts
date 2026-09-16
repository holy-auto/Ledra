import { z } from "zod";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PNG magic bytes — content_type and filename can be spoofed by the
// client, so we re-check the actual bytes before writing to Storage.
// Mirrors the helper in src/app/admin/logo/page.tsx.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const KIND_VALUES = ["manufacturer_logo", "manufacturer_template_thumbnail"] as const;
type Kind = (typeof KIND_VALUES)[number];

const metaSchema = z.object({
  kind: z.enum(KIND_VALUES),
  manufacturer_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
});

function objectPathFor(kind: Kind, manufacturerId: string, templateId?: string) {
  if (kind === "manufacturer_logo") {
    return `manufacturers/${manufacturerId}/logo.png`;
  }
  // thumbnail: require the template id so we can keep one thumbnail per
  // design without collisions. The client schema enforces this above
  // (we still defensively guard at runtime).
  if (!templateId) {
    throw new Error("template_id is required for manufacturer_template_thumbnail");
  }
  return `manufacturers/${manufacturerId}/templates/${templateId}/thumbnail.png`;
}

/**
 * POST /api/admin/platform/manufacturers/upload
 *
 * Multipart upload for a manufacturer logo or one of its template
 * thumbnails. Returns the resulting Storage object path so the admin
 * UI can write it back to `manufacturers.logo_asset_path` /
 * `manufacturer_templates.thumbnail_path` via PATCH.
 *
 * Fields:
 *   file              — PNG file (≤ 2MB, magic bytes verified)
 *   kind              — "manufacturer_logo" | "manufacturer_template_thumbnail"
 *   manufacturer_id   — uuid
 *   template_id       — uuid (required for thumbnail kind)
 */
export const POST = withCaller(
  async (req, { caller }) => {
    if (!isPlatformAdmin(caller)) return apiForbidden();

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return apiValidationError("multipart/form-data として読み取れませんでした。");
    }

    const parsed = metaSchema.safeParse({
      kind: form.get("kind"),
      manufacturer_id: form.get("manufacturer_id"),
      template_id: form.get("template_id") ?? undefined,
    });
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
    }
    const { kind, manufacturer_id, template_id } = parsed.data;
    if (kind === "manufacturer_template_thumbnail" && !template_id) {
      return apiValidationError("サムネイル登録には template_id が必要です。");
    }

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return apiValidationError("ファイルが添付されていません。");
    }
    if (file.size > MAX_BYTES) {
      return apiValidationError("ファイルサイズは 2MB 以下にしてください。");
    }
    if (file.type !== "image/png") {
      return apiValidationError("PNG のみ対応しています。");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPngSignature(bytes)) {
      return apiValidationError("PNG として読み取れないファイルです。");
    }

    const objectPath = objectPathFor(kind, manufacturer_id, template_id);

    try {
      const admin = createPlatformScopedAdmin(
        "admin/manufacturers upload — write to assets bucket for manufacturer-owned imagery",
      );
      const up = await admin.storage
        .from("assets")
        .upload(objectPath, bytes, { contentType: "image/png", upsert: true });
      if (up.error) {
        return apiInternalError(up.error, "manufacturers upload");
      }
      return apiJson({ path: objectPath });
    } catch (e) {
      return apiInternalError(e, "manufacturers upload");
    }
  },
  { routeName: "manufacturers upload" },
);
