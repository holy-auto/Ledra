import type { ComponentProps } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Stack, router } from "expo-router";
import { Icon } from "react-native-paper";

import { colors, sizing } from "@/constants/tokens";

// @react-navigation/native-stack は expo-router の推移的依存でしか入っていないので
// 直接 import せず、Stack の props から型を借りる
type ScreenOptions = ComponentProps<typeof Stack>["screenOptions"];

/**
 * 戻るボタン。
 *
 * expo-router では、別のトップレベルルートグループへ push した画面に
 * Stack 上の前任者がいないため React Navigation が既定の戻るボタンを出さない。
 * 各 Stack に明示的に headerLeft を渡す必要がある。
 *
 * ponytail: タップ領域は 44x44 の正方形で、左右非対称な margin を付けない。
 * margin を付けると iOS がヘッダーボタンに被せる円形コンテナの中で
 * アイコンが偏り、さらに円の縁を押しても反応しない領域ができる。
 */
export function HeaderBackButton() {
  return (
    <Pressable
      // ディープリンク（ledra://certificates/xxx）で直接起動すると履歴が空で、
      // router.back() が何も起きないボタンになる。その場合はホームへ戻す
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
      hitSlop={8}
      style={styles.backButton}
      accessibilityRole="button"
      accessibilityLabel="戻る"
    >
      <Icon source="chevron-left" size={28} color={colors.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backButton: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});

/** タブ根の Stack 用。見た目だけ揃える（タブ根に戻るボタンは要らない） */
export const tabStackScreenOptions: ScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontSize: 18, fontWeight: "700" },
};

/**
 * 詳細画面 Stack の共通 screenOptions。
 *
 * ponytail: 戻るボタンを各 _layout.tsx に手で書いていたら書き漏らしが出た。
 * 新しい Stack はこれを渡すだけで戻れるようにしておく。
 */
export const stackScreenOptions: ScreenOptions = {
  ...tabStackScreenOptions,
  headerLeft: () => <HeaderBackButton />,
};
