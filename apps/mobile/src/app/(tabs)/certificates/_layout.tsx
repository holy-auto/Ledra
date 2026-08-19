import { Stack } from "expo-router";

export default function CertificatesTabLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "証明" }} />
    </Stack>
  );
}
