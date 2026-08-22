import { Stack } from "expo-router";
import { tabStackScreenOptions } from "@/components/screenOptions";

export default function VehiclesLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "車両" }} />
    </Stack>
  );
}
