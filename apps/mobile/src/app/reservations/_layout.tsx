import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function ReservationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: "予約詳細" }} />
      <Stack.Screen name="new" options={{ title: "予約作成" }} />
    </Stack>
  );
}
