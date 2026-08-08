import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { mobileApi } from "./api";

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
