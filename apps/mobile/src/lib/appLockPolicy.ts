/**
 * アプリロックの状態遷移。SecureStore を触らない純粋な部分だけをここに置く
 * （expo-secure-store は Node から import できず、自己チェックが書けないため）。
 */

export type LockState =
  /** 通常。中身が見える */
  | "open"
  /** 生体認証待ち */
  | "locked"
  /** 生体認証では二度と開かない状態。解除するか、ログアウトするしかない */
  | "needs_setup";

/** バックグラウンドがこの時間を超えて続いたら再ロックする */
export const RELOCK_AFTER_MS = 5 * 60_000;

/**
 * フォアグラウンド復帰時の次の状態。
 *
 * 判定の順番が安全性そのもの。閉じている側（locked / needs_setup）を先に返さないと、
 * 有効フラグの読み取りが1回失敗しただけで、認証なしにロックが外れる。
 *
 * @param awayMs background に落ちていた時間。ミリ秒。background を経ていなければ null
 *   （生体認証プロンプトや通知センターは inactive 止まりで background にはならない）。
 *   端末の時刻を戻されると負になりうるので、負は「不明」として閉じる側に倒す。
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
  // 解除しないまま離れて戻ってきた場合は閉じたまま。enabled の判定より先に置くこと
  if (current !== "open") return current;
  if (!enabled) return "open";
  if (awayMs === null) return "open";
  // 時刻が巻き戻された等で負になったら経過時間が分からない。ロックする
  if (awayMs < 0) return "locked";
  return awayMs >= RELOCK_AFTER_MS ? "locked" : "open";
}
