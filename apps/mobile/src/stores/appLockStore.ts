import { create } from "zustand";

import { isAppLockEnabledSync, type LockState } from "@/lib/appLock";
import { useAuthStore } from "@/stores/authStore";

interface AppLockStore {
  state: LockState;
  /** 生体認証の連続失敗回数。一定回数でロック解除以外の逃げ道を出す */
  failures: number;
  setState: (state: LockState) => void;
  countFailure: () => void;
}

/**
 * ロックの現在地。コンポーネントの外に置くのは、覆う側（AppLockGate）と
 * 自分から引っ込む必要がある側（RN の Modal を使う BottomSheet）が別の木にいるため。
 * RN の Modal はネイティブの別ウィンドウなので、zIndex でも Portal でも上に被せられない。
 */
export const useAppLockStore = create<AppLockStore>((set) => ({
  // 実際の初期値は initAppLockState() が決める。
  // ここ（モジュール読み込み時）で決めると、セッション復元より前に走って必ず "open" になる
  state: "open",
  failures: 0,
  setState: (state) =>
    set((s) => ({ state, failures: state === "open" ? 0 : s.failures })),
  countFailure: () => set((s) => ({ failures: s.failures + 1 })),
}));

/**
 * 起動時のロック状態を確定させる。セッション復元が終わった直後に一度だけ呼ぶこと。
 * 描画が始まる前に同期で決めるので、ロック中の中身が一瞬も見えない。
 */
export function initAppLockState() {
  useAppLockStore.setState({
    state:
      // 未ログインならログイン画面が出るので被せない
      useAuthStore.getState().isAuthenticated && isAppLockEnabledSync()
        ? "locked"
        : "open",
    failures: 0,
  });
}

/** ロック中は中身を出してはいけない、を1箇所で判定する */
export function useIsAppLocked(): boolean {
  return useAppLockStore((s) => s.state !== "open");
}
