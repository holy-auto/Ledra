import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function LegalLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="[doc]" />
      <Stack.Screen name="contact" options={{ title: "お問い合わせ" }} />
    </Stack>
  );
}
