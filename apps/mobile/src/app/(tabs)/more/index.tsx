import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { colors, radius, spacing, sizing, shadows } from "@/constants/tokens";

/**
 * その他メニュー — v2.0 / UI-070 reference target.
 *
 * Sectioned list layout (not grid) per reference 07:
 * 通知・同期 / サポート / 設定 / その他
 * Role-restricted items hidden (v2.0: hidden, not disabled).
 */

interface MenuItem {
  icon: string;
  label: string;
  route: string;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

const SECTIONS: MenuSection[] = [
  {
    title: "業務管理",
    items: [
      { icon: "calendar-clock-outline", label: "予約管理", route: "/reservations" },
      { icon: "cash-register", label: "POS・会計", route: "/pos/register" },
      { icon: "account-group-outline", label: "顧客一覧", route: "/customers" },
    ],
  },
  {
    title: "通知・同期",
    items: [
      { icon: "bell-outline", label: "通知一覧", route: "/notifications" },
      { icon: "cloud-sync-outline", label: "Sync Center（同期状況）", route: "/sync" },
    ],
  },
  {
    title: "サポート",
    items: [
      { icon: "help-circle-outline", label: "ヘルプセンター", route: "/help" },
      { icon: "email-outline", label: "お問い合わせ", route: "/contact" },
      { icon: "message-text-outline", label: "フィードバックを送る", route: "/feedback" },
    ],
  },
  {
    title: "設定",
    items: [
      { icon: "account-outline", label: "アカウント設定", route: "/settings" },
      { icon: "account-group-outline", label: "スタッフ・権限管理", route: "/settings/staff" },
      { icon: "cog-outline", label: "各種設定", route: "/settings/general" },
    ],
  },
  {
    title: "その他",
    items: [
      { icon: "information-outline", label: "Ledraについて", route: "/about" },
      { icon: "file-document-outline", label: "利用規約", route: "/terms" },
      { icon: "shield-check-outline", label: "プライバシーポリシー", route: "/privacy" },
    ],
  },
];

export default function MoreScreen() {
  const { user, selectedStore } = useAuthStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Store info card */}
      <View style={styles.storeCard}>
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
      </View>

      {/* Menu sections */}
      {SECTIONS.map((section) => (
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
                  onPress={() => router.push(item.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Icon source={item.icon} size={sizing.iconMd} color={colors.textPrimary} />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Icon source="chevron-right" size={18} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}

      <View style={{ height: spacing["4xl"] }} />
    </ScrollView>
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
    paddingBottom: sizing.fabClearance,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: spacing.xl + sizing.iconMd + spacing.md,
  },
});
