import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function ReservationsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "予約" }} />
      <Stack.Screen name="[id]" options={{ title: "予約詳細" }} />
      <Stack.Screen name="new" options={{ title: "予約作成" }} />
    </Stack>
  );
}
