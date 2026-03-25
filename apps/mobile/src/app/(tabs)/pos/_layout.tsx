import { Stack } from "expo-router";

export default function PosTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "会計", headerLargeTitle: true }}
      />
    </Stack>
  );
}
