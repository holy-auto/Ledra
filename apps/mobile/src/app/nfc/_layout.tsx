import { Pressable } from "react-native";
import { Stack, router } from "expo-router";
import { Icon } from "react-native-paper";
import { colors, spacing } from "@/constants/tokens";

export default function NfcLayout() {
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
      <Stack.Screen name="scan" options={{ title: "NFCスキャン" }} />
      <Stack.Screen name="write/[certificateId]" options={{ title: "NFC書込" }} />
      <Stack.Screen name="tags" options={{ title: "NFCタグ台帳" }} />
    </Stack>
  );
}
