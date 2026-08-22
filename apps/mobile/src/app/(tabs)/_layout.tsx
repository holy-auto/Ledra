import { useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Tabs } from "expo-router";
import { Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/authStore";
import { Redirect } from "expo-router";
import { QuickCreateSheet } from "@/components/ui/QuickCreateSheet";
import { colors, spacing, sizing, shadows } from "@/constants/tokens";

/**
 * v2.0 §2 / UI-020: ホーム / 作業 / 車両 / 証明 / その他
 *
 * 各タブは独立した丸ボタン。Quick Create の "+" はタブ選択とは別物。
 *
 * 予約 / 会計 はタブではなくトップレベル Stack のルート（app/reservations,
 * app/pos）。href: null のタブとして置くと Tabs の内側で描画されるため、
 * 戻るボタンを出せずタブバーだけが残って行き止まりになる。
 */
export default function TabsLayout() {
  const { isAuthenticated, selectedStore } = useAuthStore();
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);
  // 数値 height を渡すと react-navigation はセーフエリアを足してくれないので自前で足す。
  // 固定値で代用すると Android のジェスチャーバー配下にラベルが潜る
  const insets = useSafeAreaInsets();

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!selectedStore) return <Redirect href="/(auth)/select-store" />;

  return (
    <>
      <Tabs
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
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarStyle: {
            backgroundColor: colors.tabBarBg,
            borderTopColor: colors.borderLight,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: sizing.tabBarHeight + insets.bottom,
            paddingTop: spacing.xs,
            paddingBottom: insets.bottom + spacing.xs,
            ...shadows.card,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
            marginTop: 2,
          },
          tabBarIconStyle: {
            marginBottom: 0,
          },
          tabBarItemStyle: {
            minWidth: sizing.touchTarget,
            minHeight: 64,
          },
        }}
      >
        {/* ── v2.0 正準 5 タブ ── */}
        <Tabs.Screen
          name="index"
          options={{
            title: "ホーム",
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? "home" : "home-outline"}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="work"
          options={{
            title: "作業",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? "wrench" : "wrench-outline"}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="vehicles"
          options={{
            title: "車両",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? "car" : "car-outline"}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="certificates"
          options={{
            title: "証明",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name={focused ? "certificate" : "certificate-outline"}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: "その他",
            headerShown: false,
            tabBarIcon: ({ color, focused }) => (
              <TabIcon
                name="dots-horizontal-circle-outline"
                color={color}
                focused={focused}
              />
            ),
          }}
        />
      </Tabs>

      {/* Quick Create FAB */}
      <QuickCreateFAB onPress={() => setQuickCreateVisible(true)} />
      <QuickCreateSheet
        visible={quickCreateVisible}
        onDismiss={() => setQuickCreateVisible(false)}
      />
    </>
  );
}

/**
 * 各タブを独立した丸ボタンにする。
 * 非選択時も背景と枠線を出すことで、隣のタブとの境界が見えて押し分けられる。
 * 直径 48px は最小タップ領域 44pt を満たす。
 */
function TabIcon({
  name,
  color,
  focused,
}: {
  name: string;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
      <Icon
        source={name}
        size={sizing.tabIconSize}
        color={focused ? colors.primary : color}
      />
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
        // タブバーの実高さ（= 中身 + セーフエリア）の上に 8px 空けて置く
        { bottom: sizing.tabBarHeight + insets.bottom + spacing.sm },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
        ]}
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
  tabIconWrap: {
    width: sizing.tabIconCircle,
    height: sizing.tabIconCircle,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: sizing.tabIconCircle / 2,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabIconActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
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
    borderColor: colors.tabBarBg,
    ...shadows.fab,
  },
  fabPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.95 }],
  },
});
