import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="index" options={{ title: "設定" }} />
    </Stack>
  );
}
