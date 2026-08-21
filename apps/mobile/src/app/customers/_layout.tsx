import { Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Icon } from "react-native-paper";
import { colors, spacing } from "@/constants/tokens";

export default function CustomersLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerLeft: () => (
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={{ marginRight: spacing.sm }}
          >
            <Icon source="chevron-left" size={28} color={colors.textPrimary} />
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "顧客一覧" }} />
      <Stack.Screen name="[id]" options={{ title: "顧客詳細" }} />
      <Stack.Screen name="new" options={{ title: "顧客登録" }} />
      <Stack.Screen name="edit/[id]" options={{ title: "顧客編集" }} />
    </Stack>
  );
}
