/**
 * アプリロックの状態遷移。SecureStore を触らない純粋な部分だけをここに置く
 * （expo-secure-store は Node から import できず、自己チェックが書けないため）。
 */

export type LockState = "locked" | "open";

/** バックグラウンドがこの時間を超えて続いたら再ロックする */
export const RELOCK_AFTER_MS = 5 * 60_000;

/**
 * フォアグラウンド復帰時の次の状態。
 *
 * @param awayMs background に落ちていた時間。ミリ秒。background を経ていなければ null
 *   （生体認証プロンプトや通知センターは inactive 止まりで background にはならない）
 */
export function lockStateOnForeground(args: {
  current: LockState;
  enabled: boolean;
  authenticated: boolean;
  awayMs: number | null;
}): LockState {
  const { current, enabled, authenticated, awayMs } = args;
  // 未ログインならログイン画面が出る。その上にロックを重ねても意味がない
  if (!authenticated) return "open";
  if (!enabled) return "open";
  // 解除しないまま離れて戻ってきた場合はロックのまま
  if (current === "locked") return "locked";
  if (awayMs === null) return current;
  return awayMs >= RELOCK_AFTER_MS ? "locked" : current;
}
