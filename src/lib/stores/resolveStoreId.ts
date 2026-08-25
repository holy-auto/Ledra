/**
 * 作成する行に入れる `store_id` を決める。**Web の作成経路が全部ここを通る。**
 *
 * なぜ要るか: Web で作った証明書・予約・入金は `store_id` が入っていなかった。
 * 本番の実測（2026-08-24）で certificates 45/45・reservations 169/169・
 * payments 11/11 がすべて null。店舗を選んでいる端末からは**1件も見えない**
 * という形で表に出た（モバイルの一覧が全部空になった）。
 *
 * Web の管理画面には店舗の選択 UI が無い（`StoreSelector` は作ってあるが
 * どこからも描画されていない）。そこで **サーバが決める**:
 *   - 指定があれば、そのテナントの店舗かを確かめて使う。
 *     他テナントの店舗 ID を送られても通さない（`store_id` に外部キーが無いため、
 *     ここで弾かないと他店の行として記録できてしまう）
 *   - 指定が無ければ、**有効な店舗がちょうど1つのときだけ**それを入れる
 *
 * ponytail: 上限。有効な店舗が2つ以上あるテナントは、選ばせる UI ができるまで
 * null のまま（推測で入れない）。本番は現在3テナントすべてが1店舗なので、
 * これで全件埋まる。`is_default` を見て決める案もあるが、選び直せない状態で
 * 自動で決めると直せなくなるので採らない。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedStoreId = { ok: true; storeId: string | null } | { ok: false; error: "store_not_in_tenant" };

export async function resolveStoreId(
  client: SupabaseClient,
  tenantId: string,
  requested?: string | null,
): Promise<ResolvedStoreId> {
  const want = (requested ?? "").trim();

  if (want) {
    const { data } = await client.from("stores").select("id").eq("id", want).eq("tenant_id", tenantId).maybeSingle();
    if (!data) return { ok: false, error: "store_not_in_tenant" };
    return { ok: true, storeId: want };
  }

  // 2件取れば「1つだけか」を判定できる。全件数える必要はない
  const { data: stores } = await client
    .from("stores")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .limit(2);

  return { ok: true, storeId: stores?.length === 1 ? (stores[0].id as string) : null };
}
