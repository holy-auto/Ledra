import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function VehiclesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ title: "車両一覧" }} />
      <Stack.Screen name="[id]" options={{ title: "車両詳細" }} />
      <Stack.Screen name="new" options={{ title: "車両登録" }} />
    </Stack>
  );
}
