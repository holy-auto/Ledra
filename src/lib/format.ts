/** 日付のみ (ja-JP) */
export function formatDate(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

/** 日時 (ja-JP) */
export function formatDateTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
}

/** Unix timestamp → ja-JP datetime */
export function formatUnix(ts?: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return "-";
  return new Date(ts * 1000).toLocaleString("ja-JP");
}

/** 円表示 (例: ¥12,000) */
export function formatJpy(n?: number | null): string {
  if (n == null) return "-";
  return `¥${n.toLocaleString("ja-JP")}`;
}

/**
 * ハッシュ / アドレスを中央省略する (例: `0x12345678…abcdef`)。
 * 先頭 `head` 文字・末尾 `tail` 文字を残す。短い値はそのまま返す。
 */
export function truncateHash(v?: string | null, head = 10, tail = 6): string {
  if (!v) return "-";
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}…${v.slice(-tail)}`;
}
