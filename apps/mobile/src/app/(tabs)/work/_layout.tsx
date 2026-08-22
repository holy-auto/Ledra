import { Stack } from "expo-router";
import { tabStackScreenOptions } from "@/components/screenOptions";

export default function WorkTabLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "作業" }} />
    </Stack>
  );
}
