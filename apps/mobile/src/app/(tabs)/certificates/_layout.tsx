import { Stack } from "expo-router";
import { tabStackScreenOptions } from "@/components/screenOptions";

export default function CertificatesLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "証明" }} />
    </Stack>
  );
}
