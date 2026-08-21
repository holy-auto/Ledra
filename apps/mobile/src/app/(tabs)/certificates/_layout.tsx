import { Stack } from "expo-router";
import { colors } from "@/constants/tokens";

export default function CertificatesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontSize: 18, fontWeight: "700" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "証明" }} />
    </Stack>
  );
}
