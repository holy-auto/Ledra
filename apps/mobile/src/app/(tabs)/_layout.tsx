import { Tabs } from "expo-router";
import { Icon } from "react-native-paper";
import { useAuthStore } from "@/stores/authStore";
import { Redirect } from "expo-router";

export default function TabsLayout() {
  const { isAuthenticated, selectedStore } = useAuthStore();

  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  if (!selectedStore) return <Redirect href="/(auth)/select-store" />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
        tabBarActiveTintColor: "#1a1a2e",
        tabBarInactiveTintColor: "#a1a1aa",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopColor: "#e4e4e7",
          height: 60,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarIcon: ({ color, size }) => (
            <Icon source="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reservations"
        options={{
          title: "予約",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon source="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="work"
        options={{
          title: "作業",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon source="wrench-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="pos"
        options={{
          title: "会計",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon source="cash-register" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "その他",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Icon source="dots-horizontal" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
