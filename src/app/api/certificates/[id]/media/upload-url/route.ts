import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  CERTIFICATE_MEDIA_BUCKET,
  ALLOWED_VIDEO_MIME,
  MAX_VIDEO_BYTES,
  directVideoPath,
  extensionForMime,
} from "@/lib/certificateMedia";
import { apiOk, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";

export const runtime = "nodejs";

const bodySchema = z.object({
  content_type: z.enum(ALLOWED_VIDEO_MIME, { message: "動画の形式は MP4 / MOV のみ対応しています。" }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_VIDEO_BYTES, `ファイルサイズが大きすぎます (上限 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB)。`),
});

/**
 * POST: 証明書の動画を Storage へ直接アップロードするための、署名付きアップロード URL を発行する。
 *
 * 動画は Vercel の関数の本文上限（約 4.5MB）を超えるので、`/media` に multipart で送ると関数に届く前に弾かれる。
 * ブラウザはここで受け取った token で Storage へ直接送り、その保存パスを `/media` に `primary_path` として渡す。
 * 中身（形式・大きさ）は `/media` が登録時に Storage の実物で確かめる。ここで見るのは申告値だけ。
 */
export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: cert } = await admin
        .from("certificates")
        .select("id")
        .eq("public_id", params.id)
        .eq("tenant_id", caller.tenantId)
        .limit(1)
        .maybeSingle<{ id: string }>();
      if (!cert?.id) return apiNotFound("証明書が見つかりません。");

      const path = directVideoPath(caller.tenantId, cert.id, extensionForMime(parsed.data.content_type));
      const { data, error } = await admin.storage.from(CERTIFICATE_MEDIA_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("signed upload url failed");

      return apiOk({ path: data.path, token: data.token });
    } catch (e) {
      return apiInternalError(e, "media upload-url");
    }
  },
  { rateLimit: "general", permission: "certificates:edit", routeName: "media upload-url" },
);
