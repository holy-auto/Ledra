import { Stack } from "expo-router";
import { tabStackScreenOptions } from "@/components/screenOptions";

export default function MoreTabLayout() {
  return (
    <Stack screenOptions={tabStackScreenOptions}>
      {/* 画面名はタブバーのアイコンで分かるのでヘッダーを出さず、TabTopBar（検索＋通知）を出す。
          headerShown を screenOptions に書かないこと。この配下に詳細画面を足したとき戻るボタンごと消える */}
      <Stack.Screen name="index" options={{ title: "その他", headerShown: false }} />
    </Stack>
  );
}
