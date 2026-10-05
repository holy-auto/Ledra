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
 * **期限日の翌日以降（today > retention）にのみ消去可**とする。`retentionUntilYears` は作成時刻を UTC で
 * 切り捨てて日付化するため、JST 作成だと保持期限が真の2年記念日より最大1日早くなりうる。保存義務を確実に
 * 満たす（真の2年より早く消さない）よう、当日ではなく翌日以降で判定して1日分の安全余裕を持たせる
 * （早く消す誤りは不可逆なので、長く保つ側へ倒す）。保持期限が無い（null）レコードは対象外で false。
 */
export function isRetentionExpired(retentionUntil: string | null | undefined, today: string = todayInJst()): boolean {
  if (!retentionUntil || !/^\d{4}-\d{2}-\d{2}$/.test(retentionUntil)) return false;
  return today > retentionUntil;
}
