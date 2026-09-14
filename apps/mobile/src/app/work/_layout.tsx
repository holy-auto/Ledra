import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function WorkLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="[id]/index" options={{ title: "作業詳細" }} />
      <Stack.Screen name="[id]/progress" options={{ title: "進捗公開" }} />
    </Stack>
  );
}
