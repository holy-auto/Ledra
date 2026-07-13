/**
 * 受付スロットの一括生成ヘルパー。
 *
 * 予約受付カレンダー設定で「開始〜終了を〇分毎／〇時間ごとの枠に一括分割」する
 * ための純粋関数。UI（BookingSettingsClient）と API 双方から使える副作用なしの実装。
 */

export type GeneratedSlot = {
  day_of_week: number;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  max_bookings: number;
  is_active: boolean;
  label: string | null;
};

// 分 → "HH:MM"（1440 は "24:00"）。
export function minutesToTime(m: number): string {
  if (m >= 1440) return "24:00";
  const clamped = Math.max(0, m);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

// "HH:MM" / "HH:MM:SS" → 分。"24:00" は 1440。
export function timeToMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** YYYY-MM-DD をローカル正午基準で n 日進める（日付跨ぎの TZ 揺れを避ける）。 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export interface GenerateIntervalSlotsOptions {
  /** 対象曜日（0=日〜6=土）。重複は無視。 */
  days: number[];
  /** 生成レンジ開始（分, 0〜1440）。 */
  startMin: number;
  /** 生成レンジ終了（分, 0〜1440）。 */
  endMin: number;
  /** 1枠あたりの長さ（分）。例: 30=30分毎, 60=1時間ごと。 */
  intervalMin: number;
  /** 同時受付数（既定 1）。 */
  maxBookings?: number;
  /** ラベル（任意）。 */
  label?: string | null;
}

/**
 * [startMin, endMin) を intervalMin 刻みの枠に分割し、指定曜日ぶん生成する。
 *
 * - レンジ末尾が interval で割り切れない場合、最後の枠は端数ぶんの短い枠になる
 *   （＝営業時間を取りこぼさない）。
 * - 不正入力（interval<=0 / start>=end / days 空）では空配列を返す。
 */
export function generateIntervalSlots(opts: GenerateIntervalSlotsOptions): GeneratedSlot[] {
  const { days, startMin, endMin, intervalMin } = opts;
  const maxBookings = opts.maxBookings ?? 1;
  const label = opts.label ?? null;

  if (!Number.isFinite(intervalMin) || intervalMin <= 0) return [];
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || startMin >= endMin) return [];

  // 曜日の重複を除去し 0〜6 の有効値のみ
  const uniqueDays = Array.from(new Set(days)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (uniqueDays.length === 0) return [];

  const out: GeneratedSlot[] = [];
  for (const day of uniqueDays) {
    for (let t = startMin; t < endMin; t += intervalMin) {
      const end = Math.min(t + intervalMin, endMin);
      if (end <= t) break;
      out.push({
        day_of_week: day,
        start_time: minutesToTime(t),
        end_time: minutesToTime(end),
        max_bookings: maxBookings,
        is_active: true,
        label,
      });
    }
  }
  return out;
}
