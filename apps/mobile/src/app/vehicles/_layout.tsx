import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function VehiclesLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="[id]" options={{ title: "車両詳細" }} />
      <Stack.Screen name="new" options={{ title: "車両登録" }} />
    </Stack>
  );
}
