import { Pressable } from "react-native";
import { router } from "expo-router";
import { Icon } from "react-native-paper";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

import { colors, spacing } from "@/constants/tokens";

/**
 * 戻るボタン。
 *
 * expo-router では、別のトップレベルルートグループへ push した画面に
 * Stack 上の前任者がいないため React Navigation が既定の戻るボタンを出さない。
 * 各 Stack に明示的に headerLeft を渡す必要がある。
 */
export function HeaderBackButton() {
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={8}
      style={{ marginRight: spacing.sm }}
      accessibilityRole="button"
      accessibilityLabel="戻る"
    >
      <Icon source="chevron-left" size={28} color={colors.textPrimary} />
    </Pressable>
  );
}

/**
 * 詳細画面 Stack の共通 screenOptions。
 *
 * ponytail: 戻るボタンを各 _layout.tsx に手で書いていたら書き漏らしが出た。
 * 新しい Stack はこれを渡すだけで戻れるようにしておく。
 */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontSize: 18, fontWeight: "700" },
  headerLeft: () => <HeaderBackButton />,
};
