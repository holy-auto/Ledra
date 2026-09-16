import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { mobileApi } from "./api";

// 通知ハンドラ未設定だと、アプリが起動中（フォアグラウンド/inactive）に
// 届いた通知を Expo は既定でバナー表示しない。Apple Tap to Pay 要件 5.12
// のローカル通知（useTerminal.ts）はまさにこの状態で送るため、ここで
// 明示的に「表示する」よう設定しておく（/code-review 指摘、未設定だと
// 通知が黙って表示されないまま終わる）。
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Expo Push 通知トークンを取得し、バックエンド (/api/mobile/push/register)
 * へ登録する。
 *
 * Apple Tap to Pay 要件 3.3 / 6.3:
 *   リリース時・TTP 有効化時に対象マーチャントへ少なくとも1回は通知できる
 *   よう、push トークンを収集しておく。
 *
 * - 実機のみ（シミュレータ / web は push トークンを取得できないので no-op）
 * - 権限が未許可なら要求し、拒否されたら黙って return（アプリは通常動作）
 * - 認証済みで呼ぶこと（mobileApi が Bearer を要求する）
 */
export async function registerForPushNotifications(): Promise<void> {
  // web / シミュレータは対象外
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (!Device.isDevice) return;

  try {
    // iPhone宛の通知がApple Watchへ転送された場合も「作業を見る」を表示する。
    await Notifications.setNotificationCategoryAsync("customer_arrived", [
      {
        identifier: "open_job",
        buttonTitle: "作業を見る",
        options: { opensAppToForeground: true },
      },
    ]);

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== "granted") return;

    // EAS プロジェクト ID は app.json の extra.eas.projectId に入っている。
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    // Android は通知チャンネルが無いとヘッドアップ表示されない。
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    await mobileApi("/push/register", {
      method: "POST",
      body: { token: tokenData.data, platform: Platform.OS },
    });
  } catch {
    // push 登録失敗はアプリの主要動作を妨げないため握りつぶす
    // （次回起動時に再試行される）。
  }
}

/**
 * D-A10 是正 (2026-09-08): サインアウト時に push トークンをサーバから
 * 削除する。呼ばないと、同じ端末で次にログインした別ユーザーにも前の
 * ユーザー宛の push が届き続ける（`push_tokens` は `user_id` に紐づくが、
 * 端末側は明示的に消さない限り Expo に登録されたままサーバの行が残る）。
 * signOut より**前**に呼ぶこと（mobileApi は Bearer トークンが必要）。
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return;
  if (!Device.isDevice) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await mobileApi("/push/register", {
      method: "DELETE",
      body: { token: tokenData.data },
      // code-review 指摘 (2026-09-08): handleUnauthorized() 経由（signOutEverywhere）
      // で呼ばれたときはセッションが既に破棄済みで、このリクエストは必ず 401 になる。
      // グローバル 401 ハンドラを再度起動すると自分自身を無限に呼び直す。
      skipUnauthorizedHandler: true,
    });
  } catch {
    // サインアウト自体は必ず進める。削除できなくても次回ログイン時に
    // upsert (onConflict: user_id,token) で上書きされるので実害は小さい。
  }
}
