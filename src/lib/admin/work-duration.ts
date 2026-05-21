/**
 * 作業時間のフォーマッタ。
 *
 * `H時間M分` 形式で経過時間を表示する。0 分は "0分"、1 時間未満は "M分" のみ、
 * 1 時間以上は "H時間M分"。負値や非数は 0 として扱う (UI で表示崩れしないため)。
 *
 * JobStatusPanel の作業タイマーから利用する。テストしやすいよう単独関数。
 */
export function formatWorkDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}分`;
  return `${h}時間${m}分`;
}

/**
 * 開始 / 終了 ISO 文字列から作業時間文字列を算出する。
 *
 * - 開始が無ければ null (タイマー非表示)
 * - 終了が無ければ `now` までの経過時間 (ライブ表示用)
 * - 開始 / 終了の parse 失敗時も null
 */
export function computeWorkDurationText(opts: {
  workStartedAt: string | null | undefined;
  workCompletedAt: string | null | undefined;
  isInProgress: boolean;
  now?: number;
}): string | null {
  if (!opts.workStartedAt) return null;
  const startMs = Date.parse(opts.workStartedAt);
  if (!Number.isFinite(startMs)) return null;
  const nowMs = opts.now ?? Date.now();
  const endMs = opts.workCompletedAt ? Date.parse(opts.workCompletedAt) : opts.isInProgress ? nowMs : null;
  if (endMs == null || !Number.isFinite(endMs)) return null;
  return formatWorkDuration(endMs - startMs);
}
