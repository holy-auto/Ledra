/**
 * D-A7 是正 (2026-09-08): PostgREST `.or()` フィルタに渡す検索語のサニタイズ。
 *
 * Web 版 (`src/lib/sanitize.ts`) の同名関数と同じ内容。モバイルは Web と
 * 別のビルド（Expo）で `src/lib` を直接 import できないため複製している
 * （F-8: Web↔モバイルの重複、共有パッケージ化は別途判断）。
 */

/**
 * PostgREST の `ilike` フィルタ用にワイルドカードをエスケープする。
 * ユーザー入力をそのままパターンとして渡すとパターンインジェクションになる。
 *
 * エスケープ対象: `%`（任意文字列）, `_`（任意1文字）, `\`（エスケープ文字自身）
 */
export function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * PostgREST の `.or()` / `.filter()` 文字列に埋め込む値のサニタイズ。
 * `,` は条件の区切り、`(` `)` はグルーピング/関数呼び出しの構文として
 * PostgREST に解釈されるため、ILIKE エスケープ後にこれらを除去する。
 *
 * 除去対象: `,` `(` `)`
 */
export function escapePostgrestValue(str: string): string {
  return str.replace(/[,()]/g, "");
}
