import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/authStore";
import { useTerminalStore } from "@/stores/terminalStore";
import { unregisterPushNotifications } from "@/lib/push";

/**
 * ログアウトの単一の入口。
 *
 * react-query のキャッシュを消すのを忘れると、同じ端末で次にログインした人に
 * 前のアカウントの顧客・車両が（再取得が終わるまで）そのまま見える。
 * 呼び出し側ごとに書くと必ずどれかが漏れるので、ここ1箇所に置く。
 *
 * D-A10 是正 (2026-09-08): 以前は react-query キャッシュと authStore しか
 * 消していなかった。同じ端末でユーザーを切り替える現場運用では、以下も
 * 前のユーザーのものが残っていた:
 *   - terminalStore の pendingCapturePaymentIntentId（記録待ちの決済）:
 *     次のユーザーが操作すると前の決済に紐づく状態を触りうる
 *   - push トークン: サーバから消さないと、次のユーザー宛の通知が
 *     前のユーザーの端末に届き続ける
 * SecureStore の表示モード（`ledra.displayMode.device`）は意図的に対象外。
 * account ではなく device スコープの設定で、ユーザーが変わっても
 * その端末の表示密度を保つのが仕様（uiPreferencesStore 参照）。
 *
 * @returns サインアウトに失敗した場合のエラー。ローカルのセッションは
 *   supabase-js が先に消すため、失敗しても端末には残らない。
 */
export async function signOutEverywhere() {
  // Bearer トークンが要るので、セッションを破棄する前に呼ぶ。
  await unregisterPushNotifications();
  const { error } = await supabase.auth.signOut();
  useAuthStore.getState().reset();
  useTerminalStore.getState().resetPayment();
  queryClient.clear();
  return error;
}
