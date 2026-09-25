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
