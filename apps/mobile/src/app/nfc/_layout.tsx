import { Stack } from "expo-router";

export default function NfcLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="scan" options={{ title: "NFCスキャン" }} />
      <Stack.Screen name="write/[certificateId]" options={{ title: "NFC書込" }} />
      <Stack.Screen name="tags" options={{ title: "NFCタグ台帳" }} />
    </Stack>
  );
}
