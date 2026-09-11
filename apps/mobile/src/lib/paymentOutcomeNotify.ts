import type { AppStateStatus } from "react-native";

/**
 * Apple Tap to Pay 要件 5.12（v1.7で新規追加）:
 *   決済が非承認で、かつユーザーが結果を見る前にアプリを閉じていた場合、
 *   その結果を知らせる通知を受け取れるようにすること。
 *
 * "結果を見る前にアプリを閉じていた" を AppState !== "active" とみなす。
 * ここを逆にすると通知が飛ばなくなり気づきにくい（非承認かつバックグラウンド
 * という組み合わせでしか症状が出ない）ため、独立関数にして自己チェックする。
 *
 * ponytail: NFCタップの最中にアプリごと強制終了（プロセスkill）された場合は
 * この関数の呼び出し自体が発生せず未カバー。その場合はサーバー側
 * （Stripe webhook の payment_intent.payment_failed → push_tokens へ
 * Expo Push API 送信、PaymentIntent.metadata.user_id で引ける）が必要になるが、
 * 現状そこまでのインフラは無く、今回は見送る。
 */
export function shouldNotifyDeclinedInBackground(appState: AppStateStatus): boolean {
  return appState !== "active";
}
