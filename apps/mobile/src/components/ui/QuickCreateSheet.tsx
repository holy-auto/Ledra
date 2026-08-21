import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { BottomSheet } from "./BottomSheet";
import { colors, radius, spacing, sizing } from "@/constants/tokens";

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

interface QuickAction {
  icon: string;
  label: string;
  description: string;
  route: string;
}

const actions: QuickAction[] = [
  {
    icon: "car-side",
    label: "車両登録",
    description: "新しい車両を追加",
    route: "/vehicles/new",
  },
  {
    icon: "account-plus",
    label: "顧客登録",
    description: "新しい顧客を追加",
    route: "/customers/new",
  },
  {
    icon: "calendar-plus",
    label: "予約作成",
    description: "新規予約を登録",
    route: "/(tabs)/reservations/new",
  },
  {
    icon: "wrench-outline",
    label: "作業開始",
    description: "ウォークイン入庫",
    route: "/(tabs)/work/new",
  },
];

/**
 * QuickCreateSheet — bottom sheet for the global "+" FAB.
 *
 * v2.0: Quick Create inherits known context.
 * Each action navigates to the relevant creation flow.
 */
export function QuickCreateSheet({ visible, onDismiss }: Props) {
  function handleAction(route: string) {
    onDismiss();
    // ponytail: small delay so sheet animation finishes before navigation
    setTimeout(() => router.push(route as never), 150);
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="クイック作成">
      <View style={styles.list}>
        {actions.map((action) => (
          <Pressable
            key={action.route}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => handleAction(action.route)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <View style={styles.iconWrap}>
              <Icon source={action.icon} size={sizing.iconMd} color={colors.primary} />
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.label}>{action.label}</Text>
              <Text style={styles.description}>{action.description}</Text>
            </View>
            <Icon source="chevron-right" size={20} color={colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.md,
    minHeight: sizing.touchTarget + spacing.lg,
  },
  rowPressed: {
    backgroundColor: colors.surfaceVariant,
  },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
