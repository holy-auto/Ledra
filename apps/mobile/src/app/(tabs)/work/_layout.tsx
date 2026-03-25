import { Stack } from "expo-router";

export default function WorkTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "作業", headerLargeTitle: true }}
      />
    </Stack>
  );
}
