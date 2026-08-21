import { Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Icon } from "react-native-paper";
import { colors, spacing } from "@/constants/tokens";

export default function WorkLayout() {
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
      <Stack.Screen name="[id]/index" options={{ title: "作業詳細" }} />
      <Stack.Screen name="[id]/progress" options={{ title: "進捗公開" }} />
    </Stack>
  );
}
