import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function CustomersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="index" options={{ title: "顧客一覧" }} />
      <Stack.Screen name="[id]" options={{ title: "顧客詳細" }} />
      <Stack.Screen name="new" options={{ title: "顧客登録" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "顧客編集" }} />
    </Stack>
  );
}
