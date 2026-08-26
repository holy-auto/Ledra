import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function MessagesLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "メッセージ" }} />
      <Stack.Screen name="[key]" options={{ title: "会話" }} />
    </Stack>
  );
}
