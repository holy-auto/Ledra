import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export { RELOCK_AFTER_MS, lockStateOnForeground } from "./appLockPolicy";
export type { LockState } from "./appLockPolicy";

/**
 * アプリロック（SecureStore 層）。
 *
 * セッションは端末に残るので、一度ログインすると起動しても素通りになる。
 * その手前に生体認証（Face ID / Touch ID / 指紋）を挟む。
 *
 * 新しいネイティブモジュールは足していない。既に入っている expo-secure-store の
 * `requireAuthentication` が、キーチェーン項目の読み出しに OS の生体認証を要求する。
 * expo-local-authentication を足すと EAS 再ビルドが必要になり、既存のビルドが使えなくなる。
 *
 * ponytail: 上限。expo-secure-store は iOS のアクセス制御を `.biometryCurrentSet` 固定で
 * 作るため、**端末パスコードへのフォールバックが出せない**。指が濡れている・手袋という
 * 現場条件で通らないときの逃げ道は「ログアウトしてパスワードで入り直す」だけ。
 * パスコード併用にするには expo-secure-store 側の対応か自前のネイティブ実装が要る。
 */

/** 生体認証を要求する番人。中身に意味は無く「読めた＝本人」を確かめるためだけに置く */
const GUARD_KEY = "ledra.applock.guard";
const GUARD_VALUE = "1";
/** ON/OFF の記録。ここに認証を要求すると OFF の判定にも生体認証が要って本末転倒になる */
const ENABLED_KEY = "ledra.applock.enabled";

/**
 * 番人と同じアクセス制御にする。既定（WHEN_UNLOCKED）だと端末バックアップに含まれ、
 * 機種変で「有効フラグだけ復元されて番人は来ない」状態になる
 * （THIS_DEVICE_ONLY はバックアップ対象外）。
 */
const ACCESSIBLE = SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

export type UnlockResult =
  /** 本人確認できた */
  | "ok"
  /** キャンセル・認証失敗・読み取りエラー。もう一度試せる */
  | "cancelled"
  /**
   * 番人が消えている。iOS は生体情報を追加・変更すると項目が無効化されるため
   * （`.biometryCurrentSet`）、認証プロンプトすら出ずに空が返る。
   * 再試行しても永久に開かないので、呼び出し側で再設定へ誘導すること。
   */
  | "needs_setup"
  /** 端末が生体認証を使えない（ハード非対応・未登録） */
  | "unsupported";

/**
 * 有効フラグのキャッシュ。SecureStore の同期読みは JS スレッドを止める
 * （Android は SharedPreferences 読み + AES 復号）ので、フォアグラウンド復帰のたびに
 * 叩かない。値が変わるのは下の enable/disable だけなのでここが正で足りる。
 */
let enabledCache: boolean | null = null;

/** 端末が生体認証を使える状態か（ハード非対応・未登録なら false） */
export function canUseAppLock(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

/**
 * ロックが有効か。同期なのは起動直後の初期状態を決めるため
 * （非同期にすると解決までの一瞬だけ中身が見えてしまう）。
 */
export function isAppLockEnabledSync(): boolean {
  if (enabledCache !== null) return enabledCache;
  try {
    enabledCache = SecureStore.getItem(ENABLED_KEY) === "1";
  } catch {
    enabledCache = false;
  }
  return enabledCache;
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
    // キャンセルと読み取りエラーは OSStatus まで見ないと分けられない。
    // 呼び出し側は連続失敗で needs_setup 相当の逃げ道を出すこと
    return "cancelled";
  }
}

/**
 * 有効化して、その場で1回解除まで通す。
 *
 * 保存できただけでは解除できる保証がないので確かめる。通らなければ元に戻す
 * （通らないものを有効なままにすると次回起動で開けなくなる）。
 * 設定画面とサインアップ直後の両方から呼ぶので、この手順はここに1つだけ置く。
 */
export async function enableAppLockVerified(): Promise<UnlockResult> {
  if (!canUseAppLock()) return "unsupported";

  try {
    // Android は書き込みにも生体認証が要る。ここで1回通っているので、
    // 直後にもう一度 unlockApp() を呼ぶと1つの操作で2回スキャンさせることになる
    await SecureStore.setItemAsync(GUARD_KEY, GUARD_VALUE, {
      requireAuthentication: true,
      authenticationPrompt: "Ledra のロック解除に使う生体認証を登録します",
      keychainAccessible: ACCESSIBLE,
    });

    const verified = Platform.OS === "android" ? "ok" : await unlockApp();
    if (verified !== "ok") {
      await disableAppLock();
      return verified;
    }

    await SecureStore.setItemAsync(ENABLED_KEY, "1", { keychainAccessible: ACCESSIBLE });
    enabledCache = true;
    return "ok";
  } catch {
    await disableAppLock();
    return "cancelled";
  }
}

/** 無効化。フラグの書き込みが失敗しても、キャッシュは必ず落として現在の画面を開けるようにする */
export async function disableAppLock(): Promise<void> {
  enabledCache = false;
  try {
    await SecureStore.setItemAsync(ENABLED_KEY, "0", { keychainAccessible: ACCESSIBLE });
  } catch {
    // 書けなくてもこのセッションでは無効。次回起動で復活したら再度切ってもらう
  }
  // 番人の削除は生体認証を要求しうるので、失敗しても無効化そのものを優先する
  await SecureStore.deleteItemAsync(GUARD_KEY).catch(() => {});
}
