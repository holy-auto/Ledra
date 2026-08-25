import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function NfcLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="scan" options={{ title: "NFCスキャン" }} />
      <Stack.Screen name="write/[certificateId]" options={{ title: "NFC書込" }} />
      <Stack.Screen name="tags" options={{ title: "NFCタグ台帳" }} />
    </Stack>
  );
}
