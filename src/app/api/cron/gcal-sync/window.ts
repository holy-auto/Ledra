/**
 * 定期カレンダー同期の対象期間を JST の YYYY-MM-DD で算出する純粋関数。
 *
 * push（Ledra→GCal）と pull（GCal→Ledra）の双方に渡す [from, to] を、
 * 「少し過去（直近の変更を取りこぼさない）〜数週間先（今後の予約）」で作る。
 * gcal クライアントは日付を JST 基準（`${date}T00:00:00+09:00`）で解釈するため、
 * ここでも JST の暦日で境界を切る。
 */
export function computeSyncWindow(now: Date, pastDays = 7, futureDays = 60): { from: string; to: string } {
  const fmt = (offsetDays: number): string =>
    // en-CA ロケールは "YYYY-MM-DD" 形式。timeZone 指定で JST の暦日に丸める。
    new Date(now.getTime() + offsetDays * 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Tokyo",
    });
  return { from: fmt(-pastDays), to: fmt(futureDays) };
}
