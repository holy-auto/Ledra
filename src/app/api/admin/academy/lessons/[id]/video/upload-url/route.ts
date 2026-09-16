/**
 * POST /api/admin/academy/lessons/[id]/video/upload-url
 *
 * lesson の作者 (or super_admin) が動画ファイルを browser から直接
 * provider にアップロードするための one-time URL を発行する。
 *
 * フロー:
 *   1. クライアント: POST /upload-url { filename, max_duration_sec? }
 *   2. サーバ: provider.createDirectUpload() を呼んで { upload_url, asset_id, playback_id }
 *      を取得し、academy_lessons に
 *        video_provider, video_asset_id, video_playback_id, video_status='pending'
 *      を upsert
 *   3. レスポンスの upload_url にクライアントが PUT/tus でアップロード
 *   4. provider が webhook を叩いて video_status='ready' に更新
 *
 * default provider は env DEFAULT_VIDEO_PROVIDER で切替可能。
 * Cloudflare Stream → Mux への移行はこの env を変えるだけで完了する
 * (既存 lesson は触らない、新規だけ Mux に乗る)。
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import {
  apiOk,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { getDefaultProvider } from "@/lib/video/provider";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const schema = z.object({
  filename: z.string().trim().min(1).max(255).optional(),
  max_duration_sec: z.number().int().min(60).max(7200).optional(),
});

export const POST = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, supabase, params }) => {
    const { id } = params;

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { data: lesson } = await supabase
      .from("academy_lessons")
      .select("id, author_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!lesson) return apiNotFound("レッスンが見つかりません");

    if (lesson.author_user_id !== caller.userId && caller.role !== "super_admin") {
      return apiForbidden("このレッスンを編集する権限がありません");
    }

    const provider = getDefaultProvider();
    const upload = await provider.createDirectUpload({
      filename: parsed.data.filename,
      max_duration_sec: parsed.data.max_duration_sec,
    });
    if (!upload.ok) {
      logger.warn("video provider direct-upload failed", {
        provider: provider.name,
        lessonId: id,
        error: upload.error,
      });
      return apiInternalError(new Error(upload.error), "video upload-url");
    }

    // Persist provider tags immediately. The webhook will flip video_status
    // to 'ready' once ingest finishes. If the upload itself never lands,
    // status stays 'pending' and the lesson page shows "処理中" until
    // a refresh-status job (TODO) reconciles via provider.getAsset().
    const { error: updateErr } = await supabase
      .from("academy_lessons")
      .update({
        video_provider: provider.name,
        video_asset_id: upload.data.asset_id,
        video_playback_id: upload.data.playback_id,
        video_status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) return apiInternalError(updateErr, "video upload-url persist");

    return apiOk({
      provider: provider.name,
      upload_url: upload.data.upload_url,
      asset_id: upload.data.asset_id,
      playback_id: upload.data.playback_id,
      expires_in_sec: upload.data.expires_in_sec,
    });
  },
  { routeName: "admin/academy/lessons/[id]/video/upload-url POST" },
);
