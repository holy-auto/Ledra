import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function SettingsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "設定" }} />
      <Stack.Screen name="display" options={{ title: "表示設定" }} />
      <Stack.Screen name="tap-to-pay" options={{ title: "Tap to Pay" }} />
    </Stack>
  );
}
