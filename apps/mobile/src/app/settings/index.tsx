import { useState } from "react";
import { View, ScrollView, StyleSheet, Platform, Alert, Linking } from "react-native";
import { Text, Chip, Snackbar } from "react-native-paper";
import { router } from "expo-router";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { LedraButton } from "@/components/ui";
import {
  canUseAppLock,
  disableAppLock,
  enableAppLock,
  isAppLockEnabledSync,
  unlockApp,
} from "@/lib/appLock";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

const ENV = process.env.EXPO_PUBLIC_ENV ?? "development";
const WEB_APP_URL =
  process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.ledra.co.jp";

const ENV_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  development: { label: "DEV", bg: colors.warningLight, fg: colors.warningDark },
  preview: { label: "PREVIEW", bg: colors.primaryLight, fg: colors.primaryDark },
  staging: { label: "STAGING", bg: colors.dangerLight, fg: colors.dangerDark },
  production: { label: "PROD", bg: colors.successLight, fg: colors.successDark },
};

export default function SettingsIndexScreen() {
  const { user, selectedStore, setSelectedStore, reset } = useAuthStore();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  // 同期で読めるので効果は要らない
  const [lockOn, setLockOn] = useState(isAppLockEnabledSync);
  const [lockBusy, setLockBusy] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const appVersion =
    Constants.expoConfig?.version ??
    Constants.manifest2?.extra?.expoClient?.version ??
    "1.0.0";

  // EAS Build 番号 (auto-incremented). 開発ビルドでは "—"
  const buildNumber =
    Platform.OS === "ios"
      ? (Constants.expoConfig?.ios?.buildNumber ?? "—")
      : String(Constants.expoConfig?.android?.versionCode ?? "—");

  const envInfo = ENV_BADGE[ENV] ?? ENV_BADGE.development;

  async function handleToggleLock() {
    setLockBusy(true);
    try {
      if (lockOn) {
        // 解除にも本人確認を要求する。端末を渡された第三者に切られては意味がない
        const result = await unlockApp();
        if (result === "cancelled") {
          setSnackbar("認証できなかったため変更しませんでした");
          return;
        }
        await disableAppLock();
        setLockOn(false);
        setSnackbar("アプリロックを無効にしました");
        return;
      }

      if (!canUseAppLock()) {
        setSnackbar("この端末では生体認証が使えません。端末の設定で登録してください");
        return;
      }
      await enableAppLock();
      // 保存できただけでは解除できる保証がない。その場で1回通して確かめる
      const result = await unlockApp();
      if (result !== "ok") {
        // 通らなかったものを有効なままにしない（次回起動で開けなくなる）
        await disableAppLock();
        setSnackbar("生体認証を確認できなかったため有効にしませんでした");
        return;
      }
      setLockOn(true);
      setSnackbar("アプリロックを有効にしました");
    } catch (e) {
      await disableAppLock().catch(() => {});
      setLockOn(false);
      setSnackbar(e instanceof Error ? e.message : "設定に失敗しました");
    } finally {
      setLockBusy(false);
    }
  }

  async function handleSwitchStore() {
    setSelectedStore(null);
    router.replace("/(auth)/select-store");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    reset();
    router.replace("/(auth)/login");
  }

  async function handleClearCache() {
    queryClient.clear();
    setSnackbar("キャッシュを削除しました");
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await mobileApi("/account", { method: "DELETE" });
      // 認証は削除済み。ローカルセッションを破棄してログインへ。
      await supabase.auth.signOut();
      queryClient.clear();
      reset();
      router.replace("/(auth)/login");
    } catch (e) {
      setSnackbar(
        e instanceof Error ? e.message : "アカウント削除に失敗しました"
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleOpenWeb() {
    try {
      const supported = await Linking.canOpenURL(WEB_APP_URL);
      if (!supported) throw new Error("ブラウザを開けません");
      await Linking.openURL(WEB_APP_URL);
    } catch (e) {
      setSnackbar(
        e instanceof Error ? e.message : "Web版を開けませんでした"
      );
    }
  }

  return (
    <ScrollView style={styles.container}>
      {/* 環境バッジ — production 以外は目立つ表示 (誤操作防止) */}
      {ENV !== "production" && (
        <View style={styles.envBanner}>
          <Chip
            compact
            style={{ backgroundColor: envInfo.bg }}
            textStyle={{ color: envInfo.fg, fontWeight: "700" }}
          >
            {envInfo.label} 環境
          </Chip>
        </View>
      )}

      {/* User Info */}
      <View style={styles.card}>
        <Text style={styles.heading}>ユーザー情報</Text>
        <View style={styles.divider} />

        <InfoRow label="メール" value={user?.email ?? "-"} />
        <InfoRow label="ロール" value={user?.role ?? "-"} />
        <InfoRow label="テナント" value={user?.tenantName ?? "-"} />
        <InfoRow label="店舗" value={selectedStore?.name ?? "-"} />
      </View>

      {/* Security */}
      <View style={styles.card}>
        <Text style={styles.heading}>セキュリティ</Text>
        <View style={styles.divider} />

        <Text style={styles.lockDesc}>
          一度ログインすると次回の起動から素通りになります。有効にすると、起動時と
          5分以上アプリを離れたあとに Face ID / 指紋での本人確認が入ります。
        </Text>
        <LedraButton
          variant={lockOn ? "danger" : "primary"}
          icon={lockOn ? "lock-open-variant-outline" : "lock-outline"}
          onPress={handleToggleLock}
          loading={lockBusy}
          disabled={lockBusy}
          fullWidth
        >
          {lockOn ? "アプリロックを無効にする" : "アプリロックを有効にする"}
        </LedraButton>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <LedraButton
          variant="outline"
          icon="apple"
          onPress={() => router.push("/settings/tap-to-pay")}
          fullWidth
        >
          Tap to Pay 設定
        </LedraButton>

        <LedraButton
          variant="outline"
          icon="store"
          onPress={handleSwitchStore}
          fullWidth
        >
          店舗切替
        </LedraButton>

        <LedraButton
          variant="outline"
          icon="open-in-new"
          onPress={handleOpenWeb}
          fullWidth
        >
          Web版を開く
        </LedraButton>

        <LedraButton
          variant="outline"
          icon="broom"
          onPress={() =>
            Alert.alert(
              "キャッシュを削除",
              "アプリ内に保存されているクエリキャッシュを削除します。次回以降の表示は最新データの取得から始まります。",
              [
                { text: "キャンセル", style: "cancel" },
                { text: "削除", onPress: handleClearCache },
              ],
              { cancelable: true }
            )
          }
          fullWidth
        >
          キャッシュをクリア
        </LedraButton>

        <LedraButton
          variant="danger"
          icon="logout"
          onPress={() =>
            Alert.alert(
              "ログアウト",
              "本当にログアウトしますか？",
              [
                { text: "キャンセル", style: "cancel" },
                { text: "ログアウト", style: "destructive", onPress: handleLogout },
              ],
              { cancelable: true }
            )
          }
          fullWidth
        >
          ログアウト
        </LedraButton>

        <LedraButton
          variant="ghost"
          icon="account-remove-outline"
          onPress={() =>
            Alert.alert(
              "アカウントを削除",
              "このアカウントを完全に削除します。ログインできなくなり、この操作は取り消せません。\n\nあなたが店舗の唯一の管理者(owner)の場合、店舗も無効化されます。",
              [
                { text: "キャンセル", style: "cancel" },
                { text: "削除する", style: "destructive", onPress: handleDeleteAccount },
              ],
              { cancelable: true }
            )
          }
          loading={deleting}
          disabled={deleting}
          fullWidth
        >
          アカウントを削除
        </LedraButton>
      </View>

      {/* App Info */}
      <View style={styles.card}>
        <Text style={styles.heading}>アプリ情報</Text>
        <View style={styles.divider} />
        <InfoRow label="アプリ名" value="Ledra Mobile" />
        <InfoRow label="バージョン" value={appVersion} />
        <InfoRow label="ビルド" value={buildNumber} />
        <InfoRow
          label="プラットフォーム"
          value={`${Platform.OS} ${Platform.Version}`}
        />
        <InfoRow label="環境" value={ENV} />
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.infoValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  envBanner: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    alignItems: "flex-start",
  },
  card: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  heading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  lockDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  infoRow: { marginBottom: spacing.sm },
  label: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  actions: { padding: spacing.md, gap: spacing.sm },
});
