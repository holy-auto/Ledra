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
  /** 1-based page number. 0 means "page param was absent / not requested". */
  page: number;
  perPage: number;
  from: number;
  to: number;
};

export type ParsePaginationOptions = {
  /** デフォルト件数（省略時50） */
  defaultPerPage?: number;
  /** per_page の上限（省略時500） */
  maxPerPage?: number;
};

/**
 * リクエストからページネーションパラメータを抽出
 *
 * page クエリパラメータが存在しない or 0 の場合、page=0 を返す。
 * これによりルート側で「ページネーション無し」を判別できる。
 * @param req - NextRequest or URL search params source
 * @param opts - オプション
 */
export function parsePagination(
  req: { url: string },
  opts?: ParsePaginationOptions | number,
): PaginationParams {
  // 後方互換: 第2引数が数値なら defaultPerPage として扱う
  const { defaultPerPage = DEFAULT_PER_PAGE, maxPerPage = MAX_PER_PAGE } =
    typeof opts === "number" ? { defaultPerPage: opts, maxPerPage: MAX_PER_PAGE } : (opts ?? {});

  const url = new URL(req.url);
  const rawPage = parseInt(url.searchParams.get("page") ?? "0", 10) || 0;
  const page = Math.max(0, rawPage);
  const perPage = Math.min(
    maxPerPage,
    Math.max(1, parseInt(url.searchParams.get("per_page") ?? String(defaultPerPage), 10) || defaultPerPage),
  );
  const effectivePage = Math.max(1, page);
  const from = (effectivePage - 1) * perPage;
  const to = from + perPage - 1;

  return { page, perPage, from, to };
}
