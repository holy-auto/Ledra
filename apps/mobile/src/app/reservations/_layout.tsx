import { Stack } from "expo-router";

export default function ReservationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "予約詳細" }} />
      <Stack.Screen name="new" options={{ title: "予約作成" }} />
    </Stack>
  );
}
