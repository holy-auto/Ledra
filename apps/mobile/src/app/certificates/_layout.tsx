import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function CertificatesLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="[id]/index" options={{ title: "証明書詳細" }} />
      <Stack.Screen name="[id]/photos" options={{ title: "施工写真" }} />
      <Stack.Screen name="new" options={{ title: "証明書作成" }} />
    </Stack>
  );
}
