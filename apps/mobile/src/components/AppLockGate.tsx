import { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, AppState, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import {
  disableAppLock,
  isAppLockEnabledSync,
  lockStateOnForeground,
  unlockApp,
  type LockState,
} from "@/lib/appLock";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, sizing } from "@/constants/tokens";

/**
 * ロック中は全画面を覆う。
 *
 * 画面ツリーを差し替えず上に被せるのは、解除後に元の画面と入力途中の内容を
 * そのまま戻すため（差し替えるとナビゲーションの状態が消える）。
 *
 * ponytail: 上限。これはアプリ内の目隠しなので、iOS のアプリスイッチャーに残る
 * スクリーンショットまでは隠せない。隠すにはネイティブ側で
 * applicationWillResignActive にオーバーレイを差す実装が要り、EAS 再ビルドを伴う。
 */
export function AppLockGate() {
  // 起動直後の一瞬でも中身を見せないため、初期値は同期で決める。
  // 未ログインならログイン画面が出るので被せない（設定からログアウトした場合、
  // ロックの有効フラグは残ったままになる）
  const [state, setState] = useState<LockState>(() =>
    useAuthStore.getState().isAuthenticated && isAppLockEnabledSync()
      ? "locked"
      : "open",
  );
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  // ログイン状態が変わった直後は本人確認が済んだところなので、ロックを持ち越さない。
  // ログアウト時はログイン画面に被せない、ログイン時は古いロックを出さない、の両方を兼ねる
  useEffect(() => {
    let prev = useAuthStore.getState().isAuthenticated;
    return useAuthStore.subscribe((s) => {
      if (s.isAuthenticated === prev) return;
      prev = s.isAuthenticated;
      setState("open");
    });
  }, []);

  // 自動で出す側は spinner を持たない。OS のプロンプトが既に画面を覆っているうえ、
  // 効果の中で同期的に setState するとカスケード描画になる
  const runUnlock = useCallback(async () => {
    const result = await unlockApp();
    if (result === "ok") {
      setNeedsSetup(false);
      setState("open");
      return;
    }
    // 再試行しても永久に開かない状態。再設定へ誘導する
    if (result === "needs_setup") setNeedsSetup(true);
  }, []);

  // ロックされたら自動で生体認証を出す。毎回ボタンを押させない。
  // これは OS の認証プロンプト（外部システム）を出すための効果で、状態が変わるのは
  // await のあと。同期的な setState は無い
  useEffect(() => {
    if (state !== "locked" || needsSetup) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runUnlock();
  }, [state, needsSetup, runUnlock]);

  async function handleUnlockPress() {
    setBusy(true);
    await runUnlock();
    setBusy(false);
  }

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (next !== "active") return;
      const awayFrom = backgroundedAt.current;
      backgroundedAt.current = null;
      setState((current) =>
        lockStateOnForeground({
          current,
          enabled: isAppLockEnabledSync(),
          authenticated: useAuthStore.getState().isAuthenticated,
          awayMs: awayFrom === null ? null : Date.now() - awayFrom,
        }),
      );
    });
    return () => sub.remove();
  }, []);

  async function handleGiveUpLock() {
    setBusy(true);
    await disableAppLock();
    setBusy(false);
    setNeedsSetup(false);
    setState("open");
  }

  // このボタンを押す＝ロックを通過できなかった人なので、ロックも一緒に解除する。
  // 解除してもサインアウト済みなので、ログイン画面から先には進めない
  async function handleLogout() {
    setBusy(true);
    await disableAppLock();
    await supabase.auth.signOut();
    useAuthStore.getState().reset();
    setBusy(false);
    setNeedsSetup(false);
    setState("open");
    router.replace("/(auth)/login");
  }

  if (state === "open") return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.iconWrap}>
        <Icon source="lock-outline" size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>Ledra はロック中です</Text>

      {needsSetup ? (
        <>
          <Text style={styles.body}>
            端末の生体認証が変更されたため、このロックは使えなくなりました。
            解除して続けたあと、設定から登録し直してください。
          </Text>
          <View style={styles.actions}>
            <LedraButton onPress={handleGiveUpLock} loading={busy} disabled={busy} fullWidth>
              ロックを解除して続ける
            </LedraButton>
            <Pressable onPress={handleLogout} disabled={busy} style={styles.subAction}>
              <Text style={styles.subActionText}>ログアウトする</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.body}>生体認証で本人確認してください。</Text>
          <View style={styles.actions}>
            <LedraButton
              icon="fingerprint"
              onPress={handleUnlockPress}
              loading={busy}
              disabled={busy}
              fullWidth
            >
              ロックを解除
            </LedraButton>
            <Pressable onPress={handleLogout} disabled={busy} style={styles.subAction}>
              <Text style={styles.subActionText}>別のアカウントでログイン</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
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
