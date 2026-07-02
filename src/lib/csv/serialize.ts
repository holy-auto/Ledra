/**
 * Minimal CSV serializer (RFC 4180-ish). The codebase historically
 * inlined `csvEscape` per route; this centralizes it for the
 * manufacturer-portal exports which share the same Excel-friendly
 * conventions (UTF-8 BOM + CRLF).
 */

export function csvEscape(v: unknown): string {
  let s = v == null ? "" : String(v);
  // CSV formula injection 対策: 先頭が = + - @ (および tab / CR) だと Excel 等が
  // 数式として評価してしまうため、シングルクォートを前置して無害化する。
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Build a full CSV document from a header + rows. Each row is an
 * array aligned to `header`. Prepends a UTF-8 BOM so Excel on
 * Windows opens it without mojibake, and uses CRLF line endings.
 */
export function buildCsv(header: string[], rows: Array<Array<unknown>>): string {
  const lines: string[] = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

/** Standard headers for a downloadable CSV response. */
export function csvDownloadHeaders(filename: string): Record<string, string> {
  // ヘッダインジェクション対策: ダブルクォート・改行を除去してから埋め込む。
  const safe = filename.replace(/["\r\n]/g, "");
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${safe}"`,
    "cache-control": "no-store",
  };
}
