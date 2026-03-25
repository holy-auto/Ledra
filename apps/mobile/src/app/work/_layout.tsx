import { Stack } from "expo-router";

export default function WorkLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#ffffff" },
        headerTintColor: "#1a1a2e",
      }}
    >
      <Stack.Screen name="[id]/index" options={{ title: "作業詳細" }} />
      <Stack.Screen name="[id]/photos" options={{ title: "写真" }} />
      <Stack.Screen name="[id]/progress" options={{ title: "進捗公開" }} />
    </Stack>
  );
}
