import { Stack } from "expo-router";

export default function ReservationsTabLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "予約", headerLargeTitle: true }}
      />
    </Stack>
  );
}
