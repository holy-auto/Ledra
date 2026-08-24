import { View, StyleSheet, Linking } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Text, ActivityIndicator } from "react-native-paper";

import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

/**
 * カード番号を入力して決済してもらうパネル。**会計画面とウォークインの両方**が使う。
 *
 * 中身は Stripe Checkout のリンク。お客様がその画面でカード番号を手入力する。
 * Ledra 側でカード番号を受け取らないので、PCI の範囲に入らない。
 *
 * なぜ「この端末で開く」が要るか: タッチ決済が読めなかった時の逃げ道がこれになる。
 * お客様のスマホが手元に無い／QR を読めないことがあるので、**店の端末で
 * 開いて渡せる**ようにしておく（カード番号はお客様に入力してもらうこと）。
 *
 * なぜ切り出したか: 2画面に同じ QR カードが丸ごと重複していた。この構成は
 * 過去に「片方だけ直る」事故を実際に起こしている（Tap to Pay の二重計上）。
 */
export function CardEntryPanel({
  url,
  amount,
  polling,
  mode = "qr",
  onCancel,
  onOpenError,
}: {
  url: string;
  amount: number;
  polling: boolean;
  /**
   * `card-entry` はタッチ決済が読めなかった後の経路。**この端末で開く**方が
   * 先に必要になるので、見出しをそちらに寄せる（お客様のスマホが手元に無い
   * ことがまさにこの経路に入る理由）。
   */
  mode?: "qr" | "card-entry";
  onCancel: () => void;
  onOpenError?: () => void;
}) {
  const cardEntry = mode === "card-entry";
  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {cardEntry
          ? "この端末で開いて、お客様にカード番号を入力していただきます"
          : "お客様のスマホでQRを読み込んでください"}
      </Text>
      <View style={styles.codeWrapper}>
        <QRCode value={url} size={200} />
      </View>
      <Text style={styles.subtext}>¥{amount.toLocaleString()} · Stripe Checkout</Text>
      {polling && (
        <View style={styles.pollingRow}>
          <ActivityIndicator size="small" color={colors.successDark} />
          <Text style={styles.pollingText}>決済完了を確認中...</Text>
        </View>
      )}
      <Text style={styles.hint}>
        {cardEntry
          ? "お客様のスマホがある場合は、上のQRからでも決済できます。"
          : "QRを読めないときは、この端末で開いてお客様にカード番号を入力していただけます。"}
      </Text>
      <LedraButton
        variant={cardEntry ? "primary" : "outline"}
        style={styles.action}
        onPress={() => {
          // 開けない端末がある（ブラウザが無い / MDM で制限）。**黙って何も
          // 起きないと、この経路では会計を終える手段が無くなる**ので必ず知らせる
          Linking.openURL(url).catch(() => onOpenError?.());
        }}
      >
        この端末で開く（カード番号を入力）
      </LedraButton>
      <LedraButton variant="outline" style={styles.action} onPress={onCancel}>
        QRをキャンセル
      </LedraButton>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.successLight,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.card,
  },
  title: {
    ...typography.titleMedium,
    color: colors.successDark,
    marginBottom: spacing.md,
  },
  codeWrapper: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  subtext: {
    ...typography.bodySmall,
    color: colors.successDark,
  },
  pollingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pollingText: {
    ...typography.meta,
    color: colors.successDark,
  },
  hint: {
    ...typography.meta,
    color: colors.successDark,
    marginTop: spacing.md,
    textAlign: "center",
  },
  action: { marginTop: spacing.md, alignSelf: "stretch" },
});
