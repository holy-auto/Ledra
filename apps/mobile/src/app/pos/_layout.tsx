import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function PosLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="checkout/[id]" options={{ title: "会計" }} />
      <Stack.Screen name="walk-in" options={{ title: "ウォークイン会計" }} />
      <Stack.Screen name="receipt/[id]" options={{ title: "レシート" }} />
      <Stack.Screen name="receipt-standalone/[id]" options={{ title: "レシート" }} />
      <Stack.Screen name="register" options={{ title: "レジ管理" }} />
    </Stack>
  );
}
