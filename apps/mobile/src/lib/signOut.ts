import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/authStore";

/**
 * ログアウトの単一の入口。
 *
 * react-query のキャッシュを消すのを忘れると、同じ端末で次にログインした人に
 * 前のアカウントの顧客・車両が（再取得が終わるまで）そのまま見える。
 * 呼び出し側ごとに書くと必ずどれかが漏れるので、ここ1箇所に置く。
 *
 * @returns サインアウトに失敗した場合のエラー。ローカルのセッションは
 *   supabase-js が先に消すため、失敗しても端末には残らない。
 */
export async function signOutEverywhere() {
  const { error } = await supabase.auth.signOut();
  useAuthStore.getState().reset();
  queryClient.clear();
  return error;
}
