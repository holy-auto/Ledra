/**
 * API ページネーション共通ヘルパー
 *
 * 使い方:
 *   const p = parsePagination(req);
 *   query = query.range(p.from, p.to);
 *   return apiOk({ items, page: p.page, per_page: p.perPage, total: count });
 */

const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 500;

export type PaginationParams = {
  page: number;
  perPage: number;
  from: number;
  to: number;
};

/**
 * リクエストからページネーションパラメータを抽出
 * @param req - NextRequest or URL search params source
 * @param defaultPerPage - デフォルト件数（省略時50）
 */
export function parsePagination(
  req: { url: string },
  defaultPerPage = DEFAULT_PER_PAGE,
): PaginationParams {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, parseInt(url.searchParams.get("per_page") ?? String(defaultPerPage), 10) || defaultPerPage),
  );
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  return { page, perPage, from, to };
}
