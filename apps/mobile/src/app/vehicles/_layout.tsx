import { Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Icon } from "react-native-paper";
import { colors, spacing } from "@/constants/tokens";

export default function VehiclesLayout() {
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
      <Stack.Screen name="index" options={{ title: "車両一覧" }} />
      <Stack.Screen name="[id]" options={{ title: "車両詳細" }} />
      <Stack.Screen name="new" options={{ title: "車両登録" }} />
    </Stack>
  );
}
