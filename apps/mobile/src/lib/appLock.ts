import * as SecureStore from "expo-secure-store";

export { RELOCK_AFTER_MS, lockStateOnForeground } from "./appLockPolicy";
export type { LockState } from "./appLockPolicy";

/**
 * アプリロック。
 *
 * セッションは端末に残るので、一度ログインすると起動しても素通りになる。
 * その手前に生体認証（Face ID / Touch ID / 指紋）を挟む。
 *
 * 新しいネイティブモジュールは足していない。既に入っている expo-secure-store の
 * `requireAuthentication` が、キーチェーン項目の読み出しに OS の生体認証を要求する。
 * expo-local-authentication を足すと EAS 再ビルドが必要になり、既存のビルドが使えなくなる。
 */

/** 生体認証を要求する番人。中身に意味は無く「読めた＝本人」を確かめるためだけに置く */
const GUARD_KEY = "ledra.applock.guard";
const GUARD_VALUE = "1";
/** ON/OFF の記録。ここに認証を要求すると OFF の判定にも生体認証が要って本末転倒になる */
const ENABLED_KEY = "ledra.applock.enabled";

export type UnlockResult =
  /** 本人確認できた */
  | "ok"
  /** キャンセル・認証失敗。もう一度試せる */
  | "cancelled"
  /**
   * 番人が消えている。iOS は生体情報を追加・変更すると項目が無効化されるため
   * （`.biometryCurrentSet`）、認証プロンプトすら出ずに空が返る。
   * 再試行しても永久に開かないので、呼び出し側で再設定へ誘導すること。
   */
  | "needs_setup";

/** 端末が生体認証を使える状態か（ハード非対応・未登録なら false） */
export function canUseAppLock(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/**
 * ロックが有効か。同期版を使うのは起動直後の初期状態を決めるため。
 * 非同期にすると解決までの一瞬だけ中身が見えてしまう。
 */
export function isAppLockEnabledSync(): boolean {
  try {
    return SecureStore.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

/** 有効化。番人の保存自体は認証を求めないので、直後に unlockApp() で疎通を確かめること */
export async function enableAppLock(): Promise<void> {
  await SecureStore.setItemAsync(GUARD_KEY, GUARD_VALUE, {
    requireAuthentication: true,
    authenticationPrompt: "Ledra のロック解除に使う生体認証を登録します",
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  await SecureStore.setItemAsync(ENABLED_KEY, "1");
}

export async function disableAppLock(): Promise<void> {
  await SecureStore.setItemAsync(ENABLED_KEY, "0");
  // 番人の削除は生体認証を要求しうるので、失敗しても ON/OFF の記録を優先する
  await SecureStore.deleteItemAsync(GUARD_KEY).catch(() => {});
}

/** 番人を読んで OS の生体認証プロンプトを出す */
export async function unlockApp(): Promise<UnlockResult> {
  try {
    const value = await SecureStore.getItemAsync(GUARD_KEY, {
      requireAuthentication: true,
      authenticationPrompt: "Ledra のロックを解除します",
    });
    if (value === GUARD_VALUE) return "ok";
    // プロンプトも出ずに空 = 項目が無効化された（生体情報の変更など）
    return "needs_setup";
  } catch {
    return "cancelled";
  }
}
