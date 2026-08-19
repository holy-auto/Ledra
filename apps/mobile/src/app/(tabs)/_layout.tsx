import { Tabs } from "expo-router";
import { Icon } from "react-native-paper";
import { useAuthStore } from "@/stores/authStore";
import { Redirect } from "expo-router";

/**
 * v2.0 §2 / 製品不変条件 #2: ホーム / 作業 / 車両 / 証明 / その他（IMP-020）。
 *
 * 旧タブ（予約 / 会計）はルートとして残すが、タブバーには表示しない（href: null）。
 * 予約は「その他」メニュー、会計は「その他」→レジ管理 から引き続きアクセス可能。
 */
export default function TabsLayout() {
  const { isAuthenticated, selectedStore } = useAuthStore();

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!selectedStore) return <Redirect href="/(auth)/select-store" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#71717a",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e4e4e7",
          borderTopWidth: 1,
          height: 84,
          paddingTop: 10,
          paddingBottom: 28,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      {/* ── v2.0 正準 5 タブ ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ color, focused }) => (
            <Icon
              source={focused ? "home" : "home-outline"}
              size={28}
              color={color}
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
            <Icon
              source={focused ? "wrench" : "wrench-outline"}
              size={28}
              color={color}
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
            <Icon
              source={focused ? "car" : "car-outline"}
              size={28}
              color={color}
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
            <Icon
              source={focused ? "certificate" : "certificate-outline"}
              size={28}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "その他",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Icon source="dots-horizontal-circle-outline" size={28} color={color} />
          ),
        }}
      />

      {/* ── 旧タブ（ルート維持・タブバー非表示） ── */}
      <Tabs.Screen name="reservations" options={{ href: null }} />
      <Tabs.Screen name="pos" options={{ href: null }} />
    </Tabs>
  );
}
