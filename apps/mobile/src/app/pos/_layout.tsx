import { Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Icon } from "react-native-paper";
import { colors, spacing } from "@/constants/tokens";

export default function PosLayout() {
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
      <Stack.Screen name="checkout/[id]" options={{ title: "会計" }} />
      <Stack.Screen name="walk-in" options={{ title: "ウォークイン会計" }} />
      <Stack.Screen name="receipt/[id]" options={{ title: "レシート" }} />
      <Stack.Screen name="receipt-standalone/[id]" options={{ title: "レシート" }} />
      <Stack.Screen name="register" options={{ title: "レジ管理" }} />
    </Stack>
  );
}
