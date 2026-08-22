import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Tabs, Redirect } from "expo-router";
import { Text, Icon } from "react-native-paper";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "@/stores/authStore";
import { QuickCreateSheet } from "@/components/ui/QuickCreateSheet";
import { colors, spacing, sizing, shadows, typography } from "@/constants/tokens";

/**
 * v2.0 §2 / UI-020: ホーム / 作業 / 車両 / 証明 / その他
 *
 * 予約 / 会計 はタブではなくトップレベル Stack のルート（app/reservations,
 * app/pos）。href: null のタブとして置くと Tabs の内側で描画されるため、
 * 戻るボタンを出せずタブバーだけが残って行き止まりになる。
 */

/** タブの単一定義源。タブバーの描画と Tabs.Screen の両方がここを読む */
const TABS = [
  { name: "index", title: "ホーム", icon: "home", outline: "home-outline" },
  { name: "work", title: "作業", icon: "wrench", outline: "wrench-outline" },
  { name: "vehicles", title: "車両", icon: "car", outline: "car-outline" },
  { name: "certificates", title: "証明", icon: "certificate", outline: "certificate-outline" },
  { name: "more", title: "その他", icon: "dots-horizontal-circle", outline: "dots-horizontal-circle-outline" },
] as const;

export default function TabsLayout() {
  const { isAuthenticated, selectedStore } = useAuthStore();
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!selectedStore) return <Redirect href="/(auth)/select-store" />;

  return (
    <>
      <Tabs
        tabBar={(props) => <LedraTabBar {...props} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.surface,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
          },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: "700",
            color: colors.textPrimary,
          },
        }}
      >
        {TABS.map((t) => (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{ title: t.title, headerShown: t.name === "index" }}
          />
        ))}
      </Tabs>

      <QuickCreateFAB onPress={() => setQuickCreateVisible(true)} />
      <QuickCreateSheet
        visible={quickCreateVisible}
        onDismiss={() => setQuickCreateVisible(false)}
      />
    </>
  );
}

/**
 * Uber 風のタブバー。各タブが独立した丸ボタンで、行として等幅に並ぶ。
 *
 * ponytail: React Navigation 既定の BottomTabItem は内側に固有の padding を持ち、
 * 丸ボタン + ラベルを入れると高さが足りずに潰れる（実機で位置が崩れた）。
 * 自前で描いて配置を確定させる。
 */
function LedraTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.tabBar, { paddingBottom: insets.bottom + spacing.sm }]}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, index) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const focused = state.index === index;

        return (
          <Pressable
            key={route.key}
            style={styles.tabItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.title}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
          >
            <View style={[styles.tabCircle, focused && styles.tabCircleActive]}>
              <Icon
                source={focused ? tab.icon : tab.outline}
                size={sizing.tabIconSize}
                color={focused ? colors.textOnPrimary : colors.tabInactive}
              />
            </View>
            <Text
              style={[styles.tabLabel, focused && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {tab.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * クイック作成ボタン。タブバーとは独立した右下の FAB。
 *
 * 中央配置は見送り: タブが5枚（v2.0 §2 の正準構成）だと + を列の中で
 * 中央に置けず、列の上に浮かせるとリスト行の中央に恒常的に重なる。
 * タブ選択とは別の操作なので、右下に離して置く。
 */
function QuickCreateFAB({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.fabContainer,
        { bottom: sizing.tabBarHeight + insets.bottom + spacing.sm },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="クイック作成"
      >
        <Icon source="plus" size={28} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    // 絶対配置にしてレイアウトの流れから外す。こうしないとバーが領域を占有し、
    // 背景色を地色に合わせてもスクロール内容がバーの上端で切れる。
    // 外すことで内容はバーの下を流れ、丸ボタンだけが浮いて見える
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "transparent",
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    // 丸 + ラベルが必ず収まる高さを自前で確保する
    minHeight: sizing.tabBarHeight - spacing.sm * 2,
  },
  tabCircle: {
    width: sizing.tabIconCircle,
    height: sizing.tabIconCircle,
    borderRadius: sizing.tabIconCircle / 2,
    alignItems: "center",
    justifyContent: "center",
    // 帯が無いので、丸自体が白 + 影で地色から浮く
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  tabCircleActive: {
    backgroundColor: colors.primary,
  },
  tabLabel: {
    ...typography.meta,
    fontWeight: "600",
    color: colors.tabInactive,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  fabContainer: {
    position: "absolute",
    right: spacing.xl,
    zIndex: 10,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.background,
    ...shadows.fab,
  },
  fabPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.95 }],
  },
});
