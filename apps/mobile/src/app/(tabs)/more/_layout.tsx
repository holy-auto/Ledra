import { Stack } from "expo-router";

export default function MoreTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "その他", headerLargeTitle: true }}
      />
    </Stack>
  );
}
