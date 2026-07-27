/**
 * 定期カレンダー同期の対象期間を JST の YYYY-MM-DD で算出する純粋関数。
 *
 * push（Ledra→GCal）と pull（GCal→Ledra）の双方に渡す [from, to] を、
 * 「少し過去（直近の変更を取りこぼさない）〜数週間先（今後の予約）」で作る。
 * gcal クライアントは日付を JST 基準（`${date}T00:00:00+09:00`）で解釈するため、
 * ここでも JST の暦日で境界を切る。
 */
export function computeSyncWindow(now: Date, pastDays = 7, futureDays = 60): { from: string; to: string } {
  // ロケール/ICU に依存せず JST の暦日を出す: UTC 時刻を +9h ずらして ISO の日付部を取る。
  // (JST は DST が無いので固定 +9h で正しい。toLocaleDateString('en-CA') は small-ICU 環境で
  //  MM/DD/YYYY にフォールバックし壊れ得るため使わない。)
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const fmt = (offsetDays: number): string =>
    new Date(now.getTime() + offsetDays * 86_400_000 + JST_OFFSET_MS).toISOString().slice(0, 10);
  return { from: fmt(-pastDays), to: fmt(futureDays) };
}
