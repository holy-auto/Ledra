/**
 * Minimal CSV parser. RFC 4180 準拠 (quoted fields, escaped quotes,
 * CRLF/LF) を必要十分に。Node 標準にはバンドル外なので自前で持つ。
 *
 * 想定: 1 万行 / 数 MB 規模。サーバ side で同期処理。
 */

export interface ParseCsvOptions {
  /** Treat the first line as a header. Default true. */
  header?: boolean;
  /** Trim each field. Default true. */
  trim?: boolean;
  /** Maximum bytes/cells (defense against giant uploads). */
  maxRows?: number;
  /** Maximum source byte length. Default 20MB. */
  maxBytes?: number;
}

export interface ParseCsvResult<T extends Record<string, string>> {
  header: string[];
  rows: T[];
}

export function parseCsv<T extends Record<string, string> = Record<string, string>>(
  source: string,
  options: ParseCsvOptions = {},
): ParseCsvResult<T> {
  const header = options.header ?? true;
  const trim = options.trim ?? true;
  const maxRows = options.maxRows ?? 50_000;
  // ponytail: 全 parse 前の安価なバイト上限。maxRows は parse 後にしか効かず、
  // 巨大アップロードは行チェック前に OOM しうるため入口で弾く。天井 = 20MB
  // (想定「数 MB / 1 万行」の十分上、UTF-16 換算の粗い近似)。厳密なストリーミング
  // 上限が要るなら chunked parser へ。
  const maxBytes = options.maxBytes ?? 20 * 1024 * 1024;
  if (source.length > maxBytes) {
    throw new Error(`csv_too_many_rows:bytes:${source.length}>${maxBytes}`);
  }

  const all = parseAll(source);
  if (all.length === 0) return { header: [], rows: [] };

  const head = header ? all[0].map((c) => (trim ? c.trim() : c)) : all[0].map((_, i) => `col_${i}`);
  const dataRows = header ? all.slice(1) : all;
  if (dataRows.length > maxRows) {
    throw new Error(`csv_too_many_rows:${dataRows.length}>${maxRows}`);
  }

  const rows = dataRows.map((cells) => {
    const obj: Record<string, string> = {};
    head.forEach((h, i) => {
      obj[h] = trim ? (cells[i] ?? "").trim() : (cells[i] ?? "");
    });
    return obj as T;
  });

  return { header: head, rows };
}

function parseAll(src: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  // Strip BOM
  if (src.charCodeAt(0) === 0xfeff) i = 1;

  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i += 1;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
        i += 1;
      } else if (ch === "\n" || ch === "\r") {
        row.push(cell);
        cell = "";
        out.push(row);
        row = [];
        // Swallow CRLF as a single break
        if (ch === "\r" && src[i + 1] === "\n") i += 2;
        else i += 1;
      } else {
        cell += ch;
        i += 1;
      }
    }
  }
  // Trailing cell
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => !(r.length === 1 && r[0] === ""));
}
