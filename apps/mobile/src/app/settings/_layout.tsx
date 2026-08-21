import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ title: "設定" }} />
      <Stack.Screen name="tap-to-pay" options={{ title: "Tap to Pay" }} />
    </Stack>
  );
}
