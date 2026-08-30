import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function CustomersLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "顧客一覧" }} />
      <Stack.Screen name="[id]" options={{ title: "顧客詳細" }} />
      <Stack.Screen name="new" options={{ title: "顧客登録" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "顧客編集" }} />
    </Stack>
  );
}
