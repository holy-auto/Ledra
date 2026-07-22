/**
 * GET /api/cron/publish-scheduled
 *
 * 予約投稿（site_content_posts.status='scheduled' かつ published_at 経過）を 'published' へ
 * 自動昇格する。vercel.json で 5 分おきに起動。公開読み取りは status='published' のみ表示するため、
 * 昇格するまで予約投稿は非公開のまま。
 */
import type { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { publishScheduledPosts } from "@/lib/marketing/publishScheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const auth = verifyCronRequest(req);
    if (!auth.authorized) return apiUnauthorized(auth.error);

    const result = await publishScheduledPosts();
    return apiOk(result);
  } catch (e) {
    return apiInternalError(e, "cron/publish-scheduled");
  }
}
