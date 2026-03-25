import { Stack } from "expo-router";

export default function PosLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="checkout/[id]" options={{ title: "会計" }} />
      <Stack.Screen name="receipt/[id]" options={{ title: "レシート" }} />
      <Stack.Screen name="register" options={{ title: "レジ管理" }} />
    </Stack>
  );
}
