/**
 * 法定保存期間の「保存期限日」を算出する共有ヘルパ。
 *
 * 指定整備記録簿（完成検査）＝2年、特定整備記録簿＝2年、それ以外＝1年 のように、
 * レコード種別ごとに定めた年数を今日（または指定日）から加算して YYYY-MM-DD を返す。
 * データ保持 cron はこの日付より前に該当レコードを削除してはならない。
 */
export function retentionUntilYears(years: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Asia/Tokyo の当日を "YYYY-MM-DD" で返す（en-CA は ISO 形式）。 */
export function todayInJst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 保持期限が過ぎており、その記録を消去してよいか。 [G2 / 保持期限後の消去経路]
 *
 * 保持期限（`record_retention_until`＝YYYY-MM-DD）より前は保存義務があり消去してはならない。
 * **期限日当日以降（today >= retention）は消去可**とする（ヘルパの「この日付より前に削除してはならない」に対応）。
 * 保持期限が無い（null）レコードは、この消去経路の対象外なので false を返す。
 * ponytail: 保存年数は2年スケールなので、JST/UTC の当日境界の半日差は実害にならない（当日判定は JST 固定）。
 */
export function isRetentionExpired(retentionUntil: string | null | undefined, today: string = todayInJst()): boolean {
  if (!retentionUntil || !/^\d{4}-\d{2}-\d{2}$/.test(retentionUntil)) return false;
  return today >= retentionUntil;
}
