import { after } from "next/server";
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
  isOwnDirectVideoPath,
  type MediaType,
} from "@/lib/certificateMedia";
import { apiOk, apiError, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
import { watchGateReadyTransition } from "@/lib/certificates/gateReadyNotify";
import { inspectStoredVideo } from "@/lib/certificateMedia/inspectStoredVideo";

export const runtime = "nodejs";
// 動画の本体は Storage へ直接アップロードされ、この関数は先頭だけを読む。Before/After の画像の保存に余裕を持たせる。
export const maxDuration = 60;

type UploadInput = {
  mediaType: MediaType;
  /** multipart で届いた主ファイル。動画は代わりに primaryPath（Storage へ直接アップロード済み）で届く */
  primary: File | null;
  primaryPath: string | null;
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
  const primaryFile = primary instanceof File && primary.size > 0 ? primary : null;
  const rawPath = form.get("primary_path");
  const primaryPath = typeof rawPath === "string" && rawPath.trim() ? rawPath.trim() : null;
  if (primaryPath && mediaType !== "video") {
    return { error: "primary_path は動画でのみ指定できます。" };
  }
  if (!primaryFile && !primaryPath) {
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
      primary: primaryPath ? null : primaryFile,
      primaryPath,
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

export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const tenantId = caller.tenantId;
    try {
      const { id: publicId } = params;
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
        .select("id, tenant_id, status, service_type, reservation_id")
        .eq("public_id", publicId)
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle<{
          id: string;
          tenant_id: string;
          status: string | null;
          service_type: string | null;
          reservation_id: string | null;
        }>();
      if (!certRes.data?.id) return apiNotFound("証明書が見つかりません。");
      const certId = certRes.data.id;

      // 動画を Storage へ直接アップロードした場合: 自分の証明書の、まだ登録されていない保存パスかを確かめる。
      // 登録済みのパス（同じ形）を渡されたら、重複登録もしないし、消しもしない。
      // 直接アップロードした動画を消すのは「中身が不正」と確定したときだけ（応答に discarded: true を付けて画面に伝える）。
      // それ以外の失敗（Before/ポスターの検査落ち・一時的なエラー・保存や登録の失敗）では残し、画面は同じファイルなら
      // 送り直さずに登録だけやり直す。ponytail: 登録されないまま放置された動画は残る。増えたら media/ の未登録ファイルを消す
      // 定期処理を足す（OPEN_QUESTIONS 2026-10-12）。
      const directPath = input.primaryPath;
      if (directPath) {
        if (!isOwnDirectVideoPath(directPath, tenantId, certId)) return apiValidationError("primary_path が不正です。");
        const { data: dup, error: dupErr } = await admin
          .from("certificate_media")
          .select("id")
          .eq("storage_path", directPath)
          .limit(1)
          .maybeSingle();
        if (dupErr) throw dupErr;
        if (dup) return apiError({ code: "conflict", message: "この動画は登録済みです。", status: 409 });
      }

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

      // 主ファイル: 直接アップロードは Storage の実物を検査する。multipart はバッファを検査する。
      let primary: { mime: string; ext: string; size: number; buffer: Buffer | null };
      if (directPath) {
        const r = await inspectStoredVideo(admin, directPath);
        if (!r.ok) {
          if (!r.definitive) return apiError({ code: "internal_error", message: r.error, status: 503 });
          await admin.storage
            .from(CERTIFICATE_MEDIA_BUCKET)
            .remove([directPath])
            .catch((e) => console.error("[media upload] discard invalid direct upload failed", e));
          return apiError({ code: "validation_error", message: r.error, status: 400, data: { discarded: true } });
        }
        primary = { ...r.data, buffer: null };
      } else {
        // parseInput が file か primary_path のどちらかを必須にしているので、ここでは file がある
        const r = await validateFile(input.primary as File, input.mediaType === "video" ? "video" : "image");
        if (!r.ok) return apiValidationError(r.error);
        primary = r.data;
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
      const primaryPath = directPath ?? `${basePath}_main.${primary.ext}`;
      const beforePath = beforeResult ? `${basePath}_before.${beforeResult.ext}` : null;
      const posterPath = posterResult ? `${basePath}_poster.${posterResult.ext}` : null;

      // Upload primary（直接アップロード済みの動画は置き済みなので送らない）
      const uploads: { path: string; buf: Buffer; mime: string }[] = [];
      if (primary.buffer) uploads.push({ path: primaryPath, buf: primary.buffer, mime: primary.mime });
      if (beforeResult && beforePath) {
        uploads.push({ path: beforePath, buf: beforeResult.buffer, mime: beforeResult.mime });
      }
      if (posterResult && posterPath) {
        uploads.push({ path: posterPath, buf: posterResult.buffer, mime: posterResult.mime });
      }

      // 失敗時に消す対象（この関数が置いたものだけ。直接アップロード済みの動画は残し、画面からの再登録に使う）
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

      // IMP-029 certificate_gate_ready: Gate が見るメディアは before_after だけ
      // （certificateHasRequiredBeforeAfterMedia）。他の種別では Gate は変わらないので評価しない。
      const notifyIfGateBecameReady =
        input.mediaType === "before_after"
          ? await watchGateReadyTransition(admin, tenantId, { ...certRes.data, public_id: publicId })
          : null;

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
          content_type: primary.mime,
          file_size: primary.size,
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

      // レスポンス後に再評価し、未 READY→READY の遷移時だけ admin へ通知（throw しない）。
      if (notifyIfGateBecameReady) after(notifyIfGateBecameReady);
      return apiOk({ media: inserted });
    } catch (e) {
      return apiInternalError(e, "media upload");
    }
  },
  { rateLimit: "general", permission: "certificates:edit", routeName: "media upload" },
);
