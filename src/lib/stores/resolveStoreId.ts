/**
 * 作成する行に入れる `store_id` を決める。**作成経路はここを通す。**
 *
 * なぜ要るか: Web で作った証明書・予約・入金は `store_id` が入っていなかった。
 * 本番の実測（2026-08-25）で certificates 45/45・reservations 169/169・
 * payments 11/11・顧客登録の招待 5/5・店舗用リンク 1/1 がすべて null。
 * 店舗を選んでいる端末からは**1件も見えない**という形で表に出た
 * （モバイルの一覧が全部空になった）。
 *
 * Web の管理画面に店舗を**選ばせる UI は無い**。`StoreSelector` は Sidebar に
 * 置かれているが、`StoreProvider` がどこにも mount されていないため
 * `useStoreContext()` が既定値（`loading: true`）を返し、常に null を描画する。
 * そもそもあれは一覧の絞り込み用で、作成フォームの入力欄ではない。
 * そこで **サーバが決める**:
 *   - 指定があれば、そのテナントの**有効な**店舗かを確かめて使う。
 *     他テナントの店舗 ID を送られても通さない（`store_id` の外部キーは
 *     `stores(id)` を指すだけでテナントの条件が無いため、ここで弾かないと
 *     他店の行として記録できてしまう）
 *   - 指定が無ければ、**有効な店舗がちょうど1つのときだけ**それを入れる
 *
 * 照合に失敗したときは `store_lookup_failed` を返す。**「無かった」と読まない。**
 * 一時的な失敗を「そのテナントの店舗ではない」と読むと正しい作成を弾き、
 * 「店舗が無い」と読むと黙って null を書いてこの関数を作った意味が消える。
 *
 * ponytail: 上限。有効な店舗が2つ以上あるテナントは、選ばせる UI ができるまで
 * null のまま（推測で入れない）。本番は現在3テナントすべてが1店舗なので、
 * これで全件埋まる。`is_default` を見て決める案もあるが、選び直せない状態で
 * 自動で決めると直せなくなるので採らない。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export type StoreResolveError = "store_not_in_tenant" | "store_lookup_failed";

export type ResolvedStoreId = { ok: true; storeId: string | null } | { ok: false; error: StoreResolveError };

/** 画面に出す文言。経路ごとに書き分けると同じ条件で違う文が出る */
export const STORE_ERROR_MESSAGES: Record<StoreResolveError, string> = {
  store_not_in_tenant: "指定された店舗が見つかりません",
  store_lookup_failed: "店舗の確認に失敗しました。時間をおいて操作し直してください",
};

/** `throw new Error(error)` で投げられたものを文言に戻す（投げる経路が2つある） */
export function storeErrorMessage(err: unknown): string | null {
  const code = err instanceof Error ? err.message : "";
  return code in STORE_ERROR_MESSAGES ? STORE_ERROR_MESSAGES[code as StoreResolveError] : null;
}

export async function resolveStoreId(
  client: SupabaseClient,
  tenantId: string,
  requested?: string | null,
): Promise<ResolvedStoreId> {
  const want = (requested ?? "").trim();

  if (want) {
    // 有効かどうかも見る。既定を選ぶ側（下）が is_active で絞っているので、
    // ここで見ないと「指定すれば無効な店舗にも書ける」というずれが残る
    const { data, error } = await client
      .from("stores")
      .select("id")
      .eq("id", want)
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle();
    if (error) return { ok: false, error: "store_lookup_failed" };
    if (!data) return { ok: false, error: "store_not_in_tenant" };
    return { ok: true, storeId: want };
  }

  // 2件取れば「1つだけか」を判定できる。全件数える必要はない
  const { data: stores, error } = await client
    .from("stores")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(2);
  if (error) return { ok: false, error: "store_lookup_failed" };

  return { ok: true, storeId: stores?.length === 1 ? (stores[0].id as string) : null };
}

/**
 * 店舗が決まらなくても**処理を止めない**経路のための薄い包み。
 *
 * 公開予約・カレンダー取り込み・AI 起票のように、店舗の照合で作成そのものを
 * 落とすと害の方が大きい所で使う。黙って null を書くと `resolveStoreId` を
 * 足した意味が消えるので、落ちた理由は必ず残す。
 */
export async function storeIdOrNull(
  client: SupabaseClient,
  tenantId: string,
  where: string,
  requested?: string | null,
): Promise<string | null> {
  const store = await resolveStoreId(client, tenantId, requested);
  if (store.ok) return store.storeId;
  logger.warn(`${where}: 店舗が決まらなかったので store_id を空にした`, { tenantId, reason: store.error });
  return null;
}
