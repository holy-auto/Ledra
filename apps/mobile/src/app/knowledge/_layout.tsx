import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function KnowledgeLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "ナレッジ" }} />
      <Stack.Screen name="[id]" options={{ title: "ナレッジ詳細" }} />
    </Stack>
  );
}
