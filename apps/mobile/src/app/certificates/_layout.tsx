import { Stack } from "expo-router";

export default function CertificatesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="index" options={{ title: "証明書一覧" }} />
      <Stack.Screen name="[id]" options={{ title: "証明書詳細" }} />
      <Stack.Screen name="new" options={{ title: "証明書作成" }} />
    </Stack>
  );
}
