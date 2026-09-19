import { Stack } from "expo-router";
import { stackScreenOptions } from "@/components/screenOptions";

export default function FieldTestLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: "実証テスト" }} />
      <Stack.Screen name="[projectId]/index" options={{ title: "案件一覧" }} />
      <Stack.Screen name="[projectId]/[jobId]/index" options={{ title: "案件詳細" }} />
      <Stack.Screen name="[projectId]/[jobId]/checks" options={{ title: "条件チェック" }} />
      <Stack.Screen name="[projectId]/[jobId]/evidence" options={{ title: "証拠アップロード" }} />
      <Stack.Screen name="[projectId]/training" options={{ title: "教育" }} />
      <Stack.Screen name="[projectId]/agreements" options={{ title: "契約" }} />
      <Stack.Screen name="recruitments/index" options={{ title: "募集一覧" }} />
      <Stack.Screen name="applications/index" options={{ title: "応募状況" }} />
      <Stack.Screen name="workshop-profile" options={{ title: "工場設備プロフィール" }} />
    </Stack>
  );
}
