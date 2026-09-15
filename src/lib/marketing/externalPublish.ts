/**
 * 外部サイト（holy-inc / MobileWash）への公開・取り下げ。
 *
 * 管理画面の保存アクションと予約公開 cron が、DB を書いたあとにこれを呼ぶ。
 * - status='published' なら md をコミットする（相手の Vercel が再ビルド）
 * - それ以外（下書き・予約・アーカイブ）なら、既に出ている md を消す
 *
 * 失敗はそのまま呼び出し元へ返す。**「DBでは公開済みなのにサイトに出ていない」
 * 状態で成功と言わない**ことがこのモジュールの役目。
 */
import { logger } from "@/lib/logger";
import { deleteRepoFile, putRepoFile, GitHubContentError } from "@/lib/github/contents";
import {
  EXTERNAL_SITES,
  ExternalPostError,
  buildExternalPostFile,
  externalFilePath,
  isExternalSite,
  type ExternalSiteId,
} from "./externalSites";
import type { SiteContentStatus, SiteContentType } from "@/lib/validations/site-content-post";

/** 同期に必要な列だけ。DB の行をそのまま渡せる形にしてある。 */
export type ExternalSyncRow = {
  site: string;
  type: SiteContentType;
  status: SiteContentStatus;
  slug: string;
  title: string;
  title_en: string | null;
  category: string | null;
  excerpt: string | null;
  body: string;
  published_at: string | null;
};

export type ExternalSyncResult =
  | { ok: true; action: "none" | "published" | "unchanged" | "removed"; url?: string }
  | { ok: false; field?: string; message: string };

function target(site: ExternalSiteId, path: string) {
  const c = EXTERNAL_SITES[site];
  return { owner: c.owner, repo: c.repo, branch: c.branch, path };
}

function toResult(err: unknown): ExternalSyncResult {
  if (err instanceof ExternalPostError) return { ok: false, field: err.field, message: err.message };
  if (err instanceof GitHubContentError) return { ok: false, message: err.message };
  logger.error("external publish failed", { error: err instanceof Error ? err.message : String(err) });
  return { ok: false, message: "外部サイトへの反映に失敗しました。" };
}

/**
 * 1件を相手サイトに反映する。
 *
 * `previous` を渡すと、スラッグや公開日が変わって置き場所がずれた場合に
 * 前のファイルを消す（消さないと同じ記事が2件出る）。
 */
export async function syncExternalPost(
  row: ExternalSyncRow,
  previous?: { slug: string; type: SiteContentType; published_at: string | null },
): Promise<ExternalSyncResult> {
  if (!isExternalSite(row.site)) return { ok: true, action: "none" };
  const site = row.site;

  try {
    const oldPath = previous ? externalFilePath(site, previous.type, previous.slug, previous.published_at) : null;

    if (row.status !== "published") {
      const path = externalFilePath(site, row.type, row.slug, row.published_at);
      for (const p of new Set([path, oldPath].filter((v): v is string => Boolean(v)))) {
        await deleteRepoFile(target(site, p), `content: ${row.title} を取り下げ`);
      }
      return { ok: true, action: "removed" };
    }

    const file = buildExternalPostFile({
      site,
      type: row.type,
      slug: row.slug,
      title: row.title,
      titleEn: row.title_en,
      category: row.category,
      excerpt: row.excerpt,
      body: row.body ?? "",
      publishedAt: row.published_at,
    });

    const { committed } = await putRepoFile(target(site, file.path), file.content, `content: ${row.title}`);

    // 置き場所が変わっていたら前のファイルを消す（同じ記事が2件出るのを防ぐ）
    if (oldPath && oldPath !== file.path) {
      await deleteRepoFile(target(site, oldPath), `content: ${row.title} の旧ファイルを削除`);
    }

    logger.info("external post synced", { site, path: file.path, committed });
    return { ok: true, action: committed ? "published" : "unchanged", url: file.url };
  } catch (err) {
    return toResult(err);
  }
}

/** 投稿そのものを消すとき。公開済みなら相手のファイルも消す。 */
export async function removeExternalPost(row: {
  site: string;
  type: SiteContentType;
  slug: string;
  title: string;
  published_at: string | null;
}): Promise<ExternalSyncResult> {
  if (!isExternalSite(row.site)) return { ok: true, action: "none" };
  try {
    const path = externalFilePath(row.site, row.type, row.slug, row.published_at);
    if (!path) return { ok: true, action: "none" };
    await deleteRepoFile(target(row.site, path), `content: ${row.title} を削除`);
    return { ok: true, action: "removed" };
  } catch (err) {
    return toResult(err);
  }
}
