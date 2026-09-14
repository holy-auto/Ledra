import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function DocumentsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "見積・請求" }} />
      <Stack.Screen name="[id]" options={{ title: "帳票" }} />
    </Stack>
  );
}
