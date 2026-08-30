import { useCallback, useEffect, useRef } from "react";
import { View, StyleSheet, AppState, Pressable } from "react-native";
import { Text, Icon, Portal } from "react-native-paper";
import { router } from "expo-router";

import { signOutEverywhere } from "@/lib/signOut";
import { useAuthStore } from "@/stores/authStore";
import { useAppLockStore } from "@/stores/appLockStore";
import {
  disableAppLock,
  isAppLockEnabledSync,
  lockStateOnForeground,
  unlockApp,
} from "@/lib/appLock";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, sizing } from "@/constants/tokens";

/** この回数続けて失敗したら、生体認証以外の逃げ道を前に出す */
const FAILURES_BEFORE_ESCAPE = 2;

/**
 * ロック中は全画面を覆う。
 *
 * 画面ツリーを差し替えず上に被せるのは、解除後に元の画面と入力途中の内容を
 * そのまま戻すため（差し替えるとナビゲーションの状態が消える）。
 * Portal に入れるのは react-native-paper の Dialog より後ろ（＝上）に描くため。
 * RN の Modal はネイティブの別ウィンドウで上に被せられないので、そちら（BottomSheet）は
 * useAppLockStore を見て自分から閉じる。
 *
 * ponytail: 上限。これはアプリ内の目隠しなので、iOS のアプリスイッチャーに残る
 * スクリーンショットまでは隠せない。隠すにはネイティブ側で
 * applicationWillResignActive にオーバーレイを差す実装が要り、EAS 再ビルドを伴う。
 */
export function AppLockGate() {
  const state = useAppLockStore((s) => s.state);
  const failures = useAppLockStore((s) => s.failures);
  const setState = useAppLockStore((s) => s.setState);
  const countFailure = useAppLockStore((s) => s.countFailure);
  const backgroundedAt = useRef<number | null>(null);
  const busy = useRef(false);

  // ログインが成立した直後は本人確認が済んだところなので、ロックを持ち越さない。
  // 逆向き（ログアウト）で開けないこと。401 で reset された瞬間に覆いが外れ、
  // ログイン画面へ遷移し終わるまでの数フレーム、中身が見える
  useEffect(() => {
    let prev = useAuthStore.getState().isAuthenticated;
    return useAuthStore.subscribe((s) => {
      const was = prev;
      prev = s.isAuthenticated;
      if (!was && s.isAuthenticated) setState("open");
    });
  }, [setState]);

  const runUnlock = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const result = await unlockApp();
    busy.current = false;
    if (result === "ok") {
      setState("open");
      return;
    }
    // 再試行しても永久に開かない状態。再設定へ誘導する
    if (result === "needs_setup") setState("needs_setup");
    else countFailure();
  }, [setState, countFailure]);

  // ロックされたら自動で生体認証を出す。毎回ボタンを押させない。
  // これは OS の認証プロンプト（外部システム）を出すための効果で、
  // 状態が変わるのは await のあと
  useEffect(() => {
    if (state !== "locked" || failures > 0) return;
    void runUnlock();
  }, [state, failures, runUnlock]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (next !== "active") return;
      const awayFrom = backgroundedAt.current;
      backgroundedAt.current = null;
      const store = useAppLockStore.getState();
      store.setState(
        lockStateOnForeground({
          current: store.state,
          enabled: isAppLockEnabledSync(),
          authenticated: useAuthStore.getState().isAuthenticated,
          awayMs: awayFrom === null ? null : Date.now() - awayFrom,
        }),
      );
    });
    return () => sub.remove();
  }, []);

  /**
   * 生体認証を諦めてロックを外す。ここに来るのは通れなかった人なので、
   * 何をしても開かない袋小路を作らないことを最優先にする。
   * disableAppLock はキャッシュを先に落とすので、書き込みが失敗しても開く。
   */
  async function handleGiveUpLock() {
    await disableAppLock();
    setState("open");
  }

  /**
   * ロックを通れないときの本来の逃げ道。パスワードで入り直せる
   * （expo-secure-store は端末パスコードへのフォールバックを出せないため、
   * 指が濡れている・手袋という現場条件ではこちらが唯一の道になる）。
   * ログアウトを先に済ませてからロックを外す。順番を逆にすると、
   * サインアウトに失敗したときロックだけ外れてセッションが残る。
   */
  async function handleLogout() {
    await signOutEverywhere().catch(() => null);
    await disableAppLock();
    setState("open");
    router.replace("/(auth)/login");
  }

  if (state === "open") return null;

  const showEscape = state === "needs_setup" || failures >= FAILURES_BEFORE_ESCAPE;

  return (
    <Portal>
      <View style={styles.overlay}>
        <View style={styles.iconWrap}>
          <Icon source="lock-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.title}>Ledra はロック中です</Text>
        <Text style={styles.body}>
          {state === "needs_setup"
            ? "端末の生体認証が変更されたため、このロックは使えなくなりました。解除して続けたあと、設定から登録し直してください。"
            : "生体認証で本人確認してください。"}
        </Text>

        <View style={styles.actions}>
          {state === "locked" && (
            <LedraButton icon="fingerprint" onPress={runUnlock} fullWidth>
              ロックを解除
            </LedraButton>
          )}

          {showEscape && (
            <>
              <LedraButton
                variant={state === "needs_setup" ? "primary" : "outline"}
                onPress={handleGiveUpLock}
                fullWidth
              >
                ロックを解除して続ける
              </LedraButton>
              <Pressable onPress={handleLogout} style={styles.subAction}>
                <Text style={styles.subActionText}>
                  ログアウトしてパスワードで入り直す
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing["2xl"],
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.md,
    marginTop: spacing["3xl"],
  },
  subAction: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: sizing.touchTarget,
  },
  subActionText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
