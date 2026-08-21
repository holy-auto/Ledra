import { useState } from "react";
import { View, StyleSheet, Pressable, Platform } from "react-native";
import { Tabs } from "expo-router";
import { Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuthStore } from "@/stores/authStore";
import { Redirect } from "expo-router";
import { QuickCreateSheet } from "@/components/ui/QuickCreateSheet";
import { colors, radius, spacing, sizing, shadows } from "@/constants/tokens";

/**
 * v2.0 §2 / UI-020: ホーム / 作業 / 車両 / 証明 / その他
 *
 * Active tab: floating Ledra Blue circular icon.
 * Global "+" FAB: Quick Create action (separate from tab selection).
 * 44x44 minimum touch targets for all tabs.
 *
 * 旧タブ（予約 / 会計）はルートとして残すが、タブバーには表示しない（href: null）。
 */
export default function TabsLayout() {
  const { isAuthenticated, selectedStore } = useAuthStore();
  const [quickCreateVisible, setQuickCreateVisible] = useState(false);

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
            height: sizing.tabBarHeight,
            paddingTop: spacing.sm,
            paddingBottom: Platform.OS === "ios" ? 28 : spacing.sm,
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
            minHeight: sizing.touchTarget,
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

        {/* ── 旧タブ（ルート維持・タブバー非表示） ── */}
        <Tabs.Screen name="reservations" options={{ href: null }} />
        <Tabs.Screen name="pos" options={{ href: null }} />
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
 * Tab icon with floating circular highlight for active state.
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
        color={focused ? colors.textOnPrimary : color}
      />
    </View>
  );
}

/**
 * Floating action button for Quick Create.
 * Positioned above tab bar, visually separated from tabs.
 */
function QuickCreateFAB({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.fabContainer,
        { bottom: sizing.tabBarHeight + (Platform.OS === "ios" ? 0 : insets.bottom) - 16 },
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
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  tabIconActive: {
    backgroundColor: colors.primary,
    ...shadows.fab,
  },
  fabContainer: {
    position: "absolute",
    right: spacing.xl,
    zIndex: 10,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.fab,
  },
  fabPressed: {
    backgroundColor: colors.primaryDark,
    transform: [{ scale: 0.95 }],
  },
});
