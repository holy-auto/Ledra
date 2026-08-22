import { Stack } from "expo-router";
import { tabStackScreenOptions } from "@/components/screenOptions";

export default function MoreTabLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "その他" }} />
    </Stack>
  );
}
