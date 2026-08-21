import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function CertificatesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ title: "証明書一覧" }} />
      <Stack.Screen name="[id]/index" options={{ title: "証明書詳細" }} />
      <Stack.Screen name="[id]/photos" options={{ title: "施工写真" }} />
      <Stack.Screen name="new" options={{ title: "証明書作成" }} />
    </Stack>
  );
}
