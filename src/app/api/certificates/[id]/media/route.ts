import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  CERTIFICATE_MEDIA_BUCKET,
  CERTIFICATE_MEDIA_STORAGE_PREFIX,
  ALLOWED_VIDEO_MIME,
  ALLOWED_IMAGE_MIME,
  MAX_VIDEO_BYTES,
  MAX_IMAGE_BYTES,
  SUPPORTED_MEDIA_TYPES,
  detectMediaMime,
  extensionForMime,
  type MediaType,
} from "@/lib/certificateMedia";
import {
  apiOk,
  apiInternalError,
  apiUnauthorized,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
// Videos can be up to 100 MB so we need extra time for upload + storage write.
export const maxDuration = 60;

type UploadInput = {
  mediaType: MediaType;
  primary: File;
  before: File | null;
  poster: File | null;
  caption: string | null;
};

function parseInput(form: FormData): { input?: UploadInput; error?: string } {
  const rawType = String(form.get("media_type") ?? "").trim();
  if (!rawType) return { error: "media_type は必須です。" };
  const mediaType = (SUPPORTED_MEDIA_TYPES as readonly string[]).includes(rawType) ? (rawType as MediaType) : null;
  if (!mediaType) {
    return {
      error: `media_type は ${SUPPORTED_MEDIA_TYPES.join("/")} のいずれかを指定してください。`,
    };
  }

  const primary = form.get("file");
  if (!(primary instanceof File) || primary.size === 0) {
    return { error: "file (主たるメディア) は必須です。" };
  }

  const before = form.get("before");
  const beforeFile = before instanceof File && before.size > 0 ? before : null;
  if (mediaType === "before_after" && !beforeFile) {
    return { error: "before_after には before (Before 画像) が必須です。" };
  }

  const poster = form.get("poster");
  const posterFile = poster instanceof File && poster.size > 0 ? poster : null;

  const captionRaw = form.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim().length > 0 ? captionRaw.trim().slice(0, 500) : null;

  return {
    input: {
      mediaType,
      primary,
      before: beforeFile,
      poster: posterFile,
      caption,
    },
  };
}

type ValidatedFile = {
  buffer: Buffer;
  mime: string;
  ext: string;
  size: number;
};

async function validateFile(
  file: File,
  expected: "video" | "image",
): Promise<{ ok: true; data: ValidatedFile } | { ok: false; error: string }> {
  const cap = expected === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > cap) {
    return {
      ok: false,
      error: `ファイルサイズが大きすぎます (上限 ${Math.round(cap / 1024 / 1024)}MB)。`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectMediaMime(buffer);
  if (!mime) {
    return {
      ok: false,
      error:
        expected === "video"
          ? "動画の形式は MP4 / MOV のみ対応しています。"
          : "画像の形式は JPEG / PNG のみ対応しています。",
    };
  }

  const allowed = expected === "video" ? ALLOWED_VIDEO_MIME : ALLOWED_IMAGE_MIME;
  if (!(allowed as readonly string[]).includes(mime)) {
    return {
      ok: false,
      error:
        expected === "video"
          ? "動画の形式は MP4 / MOV のみ対応しています。"
          : "画像の形式は JPEG / PNG のみ対応しています。",
    };
  }

  return { ok: true, data: { buffer, mime, ext: extensionForMime(mime), size: buffer.length } };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "certificates:edit")) return apiForbidden();
    const tenantId = caller.tenantId;

    const { id: publicId } = await params;
    if (!publicId) return apiValidationError("public_id は必須です。");

    const form = await req.formData();
    const parsed = parseInput(form);
    if (parsed.error || !parsed.input) {
      return apiValidationError(parsed.error ?? "入力が不正です。");
    }
    const input = parsed.input;

    const { admin } = createTenantScopedAdmin(tenantId);
    const certRes = await admin
      .from("certificates")
      .select("id, tenant_id")
      .eq("public_id", publicId)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle<{ id: string; tenant_id: string }>();
    if (!certRes.data?.id) return apiNotFound("証明書が見つかりません。");
    const certId = certRes.data.id;

    const primaryExpected: "video" | "image" = input.mediaType === "video" ? "video" : "image";
    const primaryResult = await validateFile(input.primary, primaryExpected);
    if (!primaryResult.ok) return apiValidationError(primaryResult.error);

    let beforeResult: ValidatedFile | null = null;
    if (input.before) {
      const r = await validateFile(input.before, "image");
      if (!r.ok) return apiValidationError(`before: ${r.error}`);
      beforeResult = r.data;
    }
    let posterResult: ValidatedFile | null = null;
    if (input.poster) {
      const r = await validateFile(input.poster, "image");
      if (!r.ok) return apiValidationError(`poster: ${r.error}`);
      posterResult = r.data;
    }

    // Determine sort_order = current max + 1
    const { data: maxRow } = await admin
      .from("certificate_media")
      .select("sort_order")
      .eq("certificate_id", certId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle<{ sort_order: number | null }>();
    const nextSort = (maxRow?.sort_order ?? -1) + 1;

    const ts = Date.now();
    const basePath = `${CERTIFICATE_MEDIA_STORAGE_PREFIX}/${tenantId}/${certId}/${ts}`;
    const primaryPath = `${basePath}_main.${primaryResult.data.ext}`;
    const beforePath = beforeResult ? `${basePath}_before.${beforeResult.ext}` : null;
    const posterPath = posterResult ? `${basePath}_poster.${posterResult.ext}` : null;

    // Upload primary
    const uploads: { path: string; buf: Buffer; mime: string }[] = [
      { path: primaryPath, buf: primaryResult.data.buffer, mime: primaryResult.data.mime },
    ];
    if (beforeResult && beforePath) {
      uploads.push({ path: beforePath, buf: beforeResult.buffer, mime: beforeResult.mime });
    }
    if (posterResult && posterPath) {
      uploads.push({ path: posterPath, buf: posterResult.buffer, mime: posterResult.mime });
    }

    const uploaded: string[] = [];
    for (const u of uploads) {
      const { error: upErr } = await admin.storage
        .from(CERTIFICATE_MEDIA_BUCKET)
        .upload(u.path, u.buf, { contentType: u.mime, upsert: false });
      if (upErr) {
        // Best-effort cleanup of any already-uploaded files
        if (uploaded.length > 0) {
          admin.storage
            .from(CERTIFICATE_MEDIA_BUCKET)
            .remove(uploaded)
            .catch((e) => console.error("[media upload] cleanup failed", e));
        }
        return apiInternalError(upErr, "media storage upload");
      }
      uploaded.push(u.path);
    }

    const { data: inserted, error: insertErr } = await admin
      .from("certificate_media")
      .insert({
        certificate_id: certId,
        tenant_id: tenantId,
        media_type: input.mediaType,
        storage_path: primaryPath,
        before_path: beforePath,
        poster_path: posterPath,
        caption: input.caption,
        sort_order: nextSort,
        content_type: primaryResult.data.mime,
        file_size: primaryResult.data.size,
      })
      .select(
        "id, media_type, storage_path, before_path, poster_path, caption, sort_order, content_type, file_size, created_at",
      )
      .single();

    if (insertErr || !inserted) {
      // Roll back uploaded files so we don't orphan storage objects.
      admin.storage
        .from(CERTIFICATE_MEDIA_BUCKET)
        .remove(uploaded)
        .catch((e) => console.error("[media upload] rollback failed", e));
      return apiInternalError(insertErr ?? new Error("insert failed"), "media insert");
    }

    return apiOk({ media: inserted });
  } catch (e) {
    return apiInternalError(e, "media upload");
  }
}
