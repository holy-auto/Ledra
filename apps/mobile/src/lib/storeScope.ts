/**
 * 選んだ店舗で一覧を絞る。**店舗の付いていない行も残す。**
 *
 * なぜ `.eq("store_id", id)` ではないのか:
 * Web 側の作成経路は store_id を入れていない。本番の実測（2026-08-24）で
 * certificates 45/45・reservations 169/169・payments 11/11 が **すべて null**。
 * 一致で絞ると、店舗を選んでいる端末では**一覧が必ず空になる**。
 * 実際に「証明書が1件あるはずなのに出てこない」という形で出た。
 *
 * ponytail: 上限。複数店舗のテナントでは、店舗未設定の行がどの店舗にも出る。
 * 恒久対応は Web 側の作成経路でも store_id を入れること。そこまで入れたら
 * この関数を `.eq()` に戻してよい。
 */
export function scopeToStore<Q extends { or(filter: string): Q }>(query: Q, storeId?: string | null): Q {
  if (!storeId) return query;
  // `.or()` は文字列を組み立てて渡す。`,` や `(` が混ざると式が壊れて
  // クエリごと 400 になり、**直そうとしている一覧がまた空になる**。
  // 店舗 ID は DB 由来の UUID なので、その形でなければ絞らない
  // （見えなくなるより、他店の行が混ざる方が害が小さい）。
  if (!/^[0-9a-fA-F-]{36}$/.test(storeId)) return query;
  return query.or(`store_id.eq.${storeId},store_id.is.null`);
}
