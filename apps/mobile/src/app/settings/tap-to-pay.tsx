import { useEffect, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import {
  Text,
  Icon,
  ProgressBar,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { Stack } from "expo-router";

import { useAuthStore } from "@/stores/authStore";
import { useTerminal } from "@/hooks/useTerminal";
import { useTerminalStore } from "@/stores/terminalStore";
import { LedraButton, LedraAlert } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

/**
 * Apple Tap to Pay 要件:
 *   3.6  通常フロー外（設定画面など）から有効化可能
 *   3.8  T&C 同意は admin (owner) 以上に限定
 *   3.8.1 非 admin には管理者連絡を促すメッセージを表示
 *   3.9.1 設定進捗インジケータ
 *   4.3  教育コンテンツへ Settings/Help からアクセス可能
 *   1.4  iOS バージョン非対応の案内
 */
export default function TapToPaySettingsScreen() {
  const { user, hasMinRole } = useAuthStore();
  const isAdmin = hasMinRole("admin");
  const {
    initTerminal,
    connectTapToPay,
    readerStatus,
    readerError,
    osVersionSupported,
    configurationProgress,
    termsAccepted,
  } = useTerminal();

  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  // マウント時に warmup
  useEffect(() => {
    void initTerminal();
  }, [initTerminal]);

  async function handleEnable() {
    if (!isAdmin) return;
    setBusy(true);
    try {
      const ok = await connectTapToPay();
      if (ok) {
        setSnackbar("Tap to Pay の準備が完了しました");
      } else {
        // closure の readerError は古いことがあるので store から最新を取る
        const latestErr =
          useTerminalStore.getState().readerError ?? readerError;
        setSnackbar(latestErr ?? "Tap to Pay の有効化に失敗しました");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "Tap to Pay 設定", headerShown: true }} />
      <ScrollView style={styles.container}>
        {/* iOSバージョン非対応の警告 (要件 1.4) */}
        {!osVersionSupported && (
          <View style={styles.alertContainer}>
            <LedraAlert
              severity="warning"
              title="iOS の更新が必要です"
              description="Tap to Pay は iPhone XS 以降 / iOS 16.4 以降で利用可能です。設定アプリから iOS を最新版に更新してください。"
            />
          </View>
        )}

        {/* 概要 */}
        <View style={styles.card}>
          <Text style={styles.heading}>iPhone のタッチ決済について</Text>
          <Text style={styles.body}>
            追加のカードリーダー無しで、iPhone 1台で
            コンタクトレスカード・Apple Pay・他の電子ウォレットを
            受け付けられます。
          </Text>

          <View style={styles.bullets}>
            <Bullet text="コンタクトレスカード（Visa / Mastercard 等）" />
            <Bullet text="Apple Pay" />
            <Bullet text="その他の電子ウォレット（Google Pay 等）" />
          </View>
        </View>

        {/* 有効化アクション (admin限定) */}
        <View style={styles.card}>
          <Text style={styles.heading}>有効化</Text>

          {!isAdmin ? (
            // 要件 3.8.1: 非 admin への案内
            <View style={styles.notAdminBox}>
              <Icon source="lock-outline" size={24} color={colors.textSecondary} />
              <Text style={styles.notAdminText}>
                Tap to Pay の有効化は管理者のみが行えます。{"\n"}
                管理者にご連絡ください。
              </Text>
            </View>
          ) : termsAccepted === true ? (
            <Text style={styles.enabledText}>
              ✅ 有効化済みです。チェックアウトでお使いいただけます。
            </Text>
          ) : (
            <>
              <Text style={styles.hintText}>
                下記ボタンを押すと、Apple の利用規約への同意 +
                iPhone のセットアップが行われます。
              </Text>
              <LedraButton
                icon="apple"
                onPress={handleEnable}
                loading={busy || readerStatus === "connecting"}
                disabled={!osVersionSupported || busy}
                style={styles.enableButton}
              >
                Tap to Pay を有効化する
              </LedraButton>
            </>
          )}

          {/* 要件 3.9.1: 設定進捗インジケータ */}
          {configurationProgress != null &&
            configurationProgress < 1 && (
              <View style={styles.progressBox}>
                <View style={styles.progressHeader}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.progressLabel}>
                    Tap to Pay を準備中… {Math.round(configurationProgress * 100)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={configurationProgress}
                  color={colors.primary}
                  style={{ marginTop: spacing.sm }}
                />
                <Text style={styles.progressNote}>
                  数分かかる場合があります。アプリを閉じずにお待ちください。
                </Text>
              </View>
            )}

          {readerError ? (
            <Text style={styles.errorText}>{readerError}</Text>
          ) : null}
        </View>

        {/* 要件 4.3: 設定/ヘルプ から教育コンテンツへ */}
        <View style={styles.card}>
          <Text style={styles.heading}>使い方</Text>
          <View style={styles.steps}>
            <Step n={1} text="チェックアウト画面で「iPhone のタッチ決済」をタップ" />
            <Step n={2} text="iPhone の上部にお客様のカード・スマホをかざしてもらう" />
            <Step n={3} text="支払い完了画面が表示されたら成功（iPhone はバイブで通知）" />
            <Step n={4} text="領収書はSMS・メール・共有メニューから送信可能" />
          </View>
          <Text style={styles.hintText}>
            ※ コンタクトレス決済できないカードの場合は、現金または他の決済方法をご案内ください。
          </Text>
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Icon source="check-circle" size={18} color={colors.successDark} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  alertContainer: {
    padding: spacing.md,
    paddingBottom: 0,
  },
  card: {
    margin: spacing.md,
    marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  heading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
  },
  hintText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bullets: { marginTop: spacing.md, gap: spacing.sm },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bulletText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  notAdminBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  notAdminText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  enabledText: {
    ...typography.body,
    color: colors.successDark,
    fontWeight: "600",
  },
  enableButton: { marginTop: spacing.md },
  progressBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
  },
  progressHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  progressLabel: {
    ...typography.bodySmall,
    color: colors.primaryDark,
    fontWeight: "600",
  },
  progressNote: {
    ...typography.bodySmall,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.dangerDark,
    marginTop: spacing.sm,
  },
  steps: { gap: 10, marginVertical: spacing.md },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: {
    ...typography.labelSmall,
    color: colors.textOnPrimary,
    fontWeight: "700",
  },
  stepText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});
