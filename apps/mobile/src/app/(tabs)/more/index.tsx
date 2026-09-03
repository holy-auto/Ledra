import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Text, Icon, Snackbar } from "react-native-paper";
import { router } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { useTabContentInset } from "@/hooks/useTabContentInset";
import { TabTopBar } from "@/components/TabTopBar";
import { colors, radius, spacing, sizing, shadows } from "@/constants/tokens";

/**
 * その他メニュー — v2.0 / UI-070。
 * セクション別のリスト（グリッドではない）。
 */

interface MenuItem {
  icon: string;
  label: string;
  route: string;
  /** true なら Web をブラウザで開く */
  external?: boolean;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

// settings/index.tsx と同じ env を使う。API ベースとは別物
const WEB_BASE = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.ledra.co.jp";

/**
 * ponytail: 行き先が存在しない項目は載せない。
 * 押しても何も起きない行は「壊れている」と同じで、あるだけ判断を鈍らせる。
 * 撤去したもの: Sync Center / ヘルプセンター / フィードバック / Ledraについて
 * （画面未実装）、スタッフ・権限管理 / 各種設定（未実装かつ「アカウント設定」と重複）。
 * 実装したらここへ戻す。
 */
const SECTIONS: MenuSection[] = [
  {
    title: "業務管理",
    items: [
      { icon: "calendar-clock-outline", label: "予約管理", route: "/reservations" },
      { icon: "cash-register", label: "POS・会計", route: "/pos" },
      { icon: "calculator-variant-outline", label: "レジ管理（開設・締め）", route: "/pos/register" },
      { icon: "account-group-outline", label: "顧客一覧", route: "/customers" },
      { icon: "chart-box-outline", label: "店舗ダッシュボード", route: "/dashboard" },
    ],
  },
  {
    title: "やり取り・帳票",
    items: [
      { icon: "chat-outline", label: "メッセージ", route: "/messages" },
      { icon: "file-document-outline", label: "見積・請求", route: "/documents" },
    ],
  },
  {
    title: "ナレッジ",
    items: [
      { icon: "book-open-variant", label: "現場ナレッジ", route: "/knowledge" },
    ],
  },
  {
    title: "NFC",
    items: [
      { icon: "nfc-search-variant", label: "NFCスキャン", route: "/nfc/scan" },
      { icon: "nfc-variant", label: "NFCタグ台帳", route: "/nfc/tags" },
    ],
  },
  {
    title: "通知",
    items: [
      { icon: "bell-outline", label: "通知一覧", route: "/notifications" },
    ],
  },
  {
    title: "設定",
    items: [
      { icon: "view-dashboard-outline", label: "表示設定", route: "/settings/display" },
      { icon: "account-outline", label: "アカウント設定", route: "/settings" },
      { icon: "contactless-payment", label: "Tap to Pay", route: "/settings/tap-to-pay" },
    ],
  },
  {
    title: "サポート・規約",
    items: [
      { icon: "email-outline", label: "お問い合わせ", route: "/legal/contact" },
      { icon: "file-document-outline", label: "利用規約", route: "/legal/terms" },
      { icon: "shield-check-outline", label: "プライバシーポリシー", route: "/legal/privacy" },
    ],
  },
];

/** 外部リンクを開く。開けない場合は黙って消えず理由を出す */
async function openExternal(url: string, onError: (msg: string) => void) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error("ブラウザを開けません");
    await Linking.openURL(url);
  } catch (e) {
    onError(e instanceof Error ? e.message : "リンクを開けませんでした");
  }
}

export default function MoreScreen() {
  const tabInset = useTabContentInset();
  const { user, selectedStore } = useAuthStore();
  const [snackbar, setSnackbar] = useState("");
  const [menuSearch, setMenuSearch] = useState("");

  // 検索語があればラベル一致の項目だけ残し、空になったセクションは出さない
  const mq = menuSearch.trim().toLowerCase();
  const visibleSections = mq
    ? SECTIONS.map((sec) => ({
        ...sec,
        items: sec.items.filter((i) => i.label.toLowerCase().includes(mq)),
      })).filter((sec) => sec.items.length > 0)
    : SECTIONS;

  return (
    <>
    <View style={styles.container}>
    <TabTopBar
      search={menuSearch}
      onSearchChange={setMenuSearch}
      placeholder="メニューを検索"
    />
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: tabInset }]}
      // 検索中の1タップ目がキーボード閉じに吸われないように
      keyboardShouldPersistTaps="handled"
    >
      {/* Store info card — 店舗切替 */}
      <Pressable
        style={({ pressed }) => [styles.storeCard, pressed && styles.menuRowPressed]}
        onPress={() => router.push("/(auth)/select-store")}
        accessibilityRole="button"
        accessibilityLabel="店舗を切り替える"
      >
        <View style={styles.storeIcon}>
          <Icon source="store" size={sizing.iconMd} color={colors.primary} />
        </View>
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{selectedStore?.name ?? "Ledra"}</Text>
          <Text style={styles.storeMeta}>
            {user?.email}
          </Text>
        </View>
        <Icon source="chevron-right" size={20} color={colors.textTertiary} />
      </Pressable>

      {/* Menu sections */}
      {visibleSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <View style={styles.sectionCard}>
            {section.items.map((item, i) => (
              <View key={item.route}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  style={({ pressed }) => [
                    styles.menuRow,
                    pressed && styles.menuRowPressed,
                  ]}
                  onPress={() => {
                    if (item.external) {
                      openExternal(`${WEB_BASE}${item.route}`, setSnackbar);
                      return;
                    }
                    router.push(item.route as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Icon source={item.icon} size={sizing.iconMd} color={colors.textPrimary} />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Icon
                    source={item.external ? "open-in-new" : "chevron-right"}
                    size={18}
                    color={colors.textTertiary}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}

      {visibleSections.length === 0 && (
        <Text style={styles.noHit}>「{mq}」に一致するメニューはありません</Text>
      )}

      <View style={{ height: spacing["4xl"] }} />
    </ScrollView>
    </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },

  // Store card
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadows.card,
  },
  storeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  storeMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Section
  section: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    ...shadows.card,
    overflow: "hidden",
  },

  // Menu row
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: sizing.touchTarget + spacing.sm,
  },
  menuRowPressed: {
    backgroundColor: colors.surfaceVariant,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  noHit: {
    marginTop: spacing.xl,
    textAlign: "center",
    fontSize: 14,
    color: colors.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: spacing.xl + sizing.iconMd + spacing.md,
  },
});
