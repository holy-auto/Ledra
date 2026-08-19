import { Stack } from "expo-router";

export default function VehiclesTabLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "車両" }} />
    </Stack>
  );
}
