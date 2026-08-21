import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function WorkLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="[id]/index" options={{ title: "作業詳細" }} />
      <Stack.Screen name="[id]/progress" options={{ title: "進捗公開" }} />
    </Stack>
  );
}
