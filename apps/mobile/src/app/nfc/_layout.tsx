import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function NfcLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Stack.Screen name="scan" options={{ title: "NFCスキャン" }} />
      <Stack.Screen name="write/[certificateId]" options={{ title: "NFC書込" }} />
      <Stack.Screen name="tags" options={{ title: "NFCタグ台帳" }} />
    </Stack>
  );
}
