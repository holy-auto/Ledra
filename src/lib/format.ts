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
  if (ts == null) return "-";
  return new Date(ts * 1000).toLocaleString("ja-JP");
}

/** 円表示 (例: ¥12,000) */
export function formatJpy(n?: number | null): string {
  if (n == null) return "-";
  return `¥${n.toLocaleString("ja-JP")}`;
}
