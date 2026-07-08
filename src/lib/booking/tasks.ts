/**
 * 作業内容のタスク分解と日程割り当て（純粋関数）。
 *
 * 予約に紐づく施工メニュー（品目）を「1品目＝1タスク」に分解し、1日あたりの作業上限
 * （既定 8 時間）に収まるよう順番に日へ割り当てる。所要時間が長い作業を何日に分けるかの
 * 目安を出す、予約時の日程調整アシスト。
 *
 * ponytail: タスクは品目単位の粗い分解に留める（1品目を複数タスクに更に割らない）。
 * また 1 タスクが 1 日上限を超える場合はその日に丸ごと載せる（単一作業は分割不可の前提）。
 * さらに細かい工程分解が要るなら品目マスタ側に工程テンプレートを持たせて展開する。
 */

export type DecomposedTask = {
  name: string;
  minutes: number;
  /** 1 始まりの割り当て日。 */
  day: number;
};

export interface DecomposeResult {
  tasks: DecomposedTask[];
  totalMinutes: number;
  /** 必要日数（タストが無ければ 0）。 */
  dayCount: number;
}

export interface DecomposeOptions {
  /** 1 日あたりの作業上限（分）。既定 480=8時間。 */
  maxPerDayMinutes?: number;
}

export function decomposeTasks(
  items: Array<{ name: string; minutes: number | null | undefined }>,
  opts: DecomposeOptions = {},
): DecomposeResult {
  const maxPerDay = opts.maxPerDayMinutes && opts.maxPerDayMinutes > 0 ? opts.maxPerDayMinutes : 480;
  const valid = items.filter(
    (i): i is { name: string; minutes: number } =>
      typeof i.minutes === "number" && Number.isFinite(i.minutes) && i.minutes > 0,
  );

  const tasks: DecomposedTask[] = [];
  let day = 1;
  let dayUsed = 0;
  for (const it of valid) {
    // その日に何か載っていて、追加すると上限超過なら翌日へ。
    if (dayUsed !== 0 && dayUsed + it.minutes > maxPerDay) {
      day += 1;
      dayUsed = 0;
    }
    tasks.push({ name: it.name, minutes: it.minutes, day });
    dayUsed += it.minutes;
  }

  const totalMinutes = valid.reduce((s, i) => s + i.minutes, 0);
  const dayCount = tasks.length > 0 ? tasks[tasks.length - 1].day : 0;
  return { tasks, totalMinutes, dayCount };
}
