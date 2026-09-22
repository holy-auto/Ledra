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

/**
 * RFC 6266 / 5987 の `Content-Disposition: attachment` を組み立てる。
 *
 * ファイル名に非 ASCII（例: 日本語のプロジェクト名）が入ると、`filename="..."`
 * にそのまま置いたヘッダ値は Node/undici で ByteString 変換に失敗して throw する
 * （コードポイント > 255）。そこで **ASCII フォールバックの `filename=`** と、
 * モダンクライアント向けの **`filename*=UTF-8''<percent-encoded>`** の両方を出す。
 * あわせてヘッダインジェクション対策（"・改行の除去）も行う。
 */
export function contentDispositionAttachment(filename: string): string {
  const clean = filename.replace(/["\r\n]/g, "");
  // ASCII フォールバック: 非印字 ASCII をすべて "_" に（空になれば "download"）。
  const asciiFallback = clean.replace(/[^\x20-\x7e]/g, "_") || "download";
  // RFC 5987 ext-value: encodeURIComponent が残す ' ( ) * は attr-char ではない
  // ので追加でパーセントエンコードする。
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/** Standard headers for a downloadable CSV response. */
export function csvDownloadHeaders(filename: string): Record<string, string> {
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": contentDispositionAttachment(filename),
    "cache-control": "no-store",
  };
}
