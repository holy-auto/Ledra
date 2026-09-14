/**
 * 起動時の店舗自動選択の判定。
 *
 * supabase を import しないこと。この判定は node で直接実行する自己チェック
 * (storeSelection.check.ts) から読むが、src/lib/supabase.ts はモジュール読み込み時に
 * createClient を呼ぶため、間接的にでも辿ると node 実行が落ちる。
 * 取得側は fetchActiveStores (src/lib/auth.ts) に分けてある。
 */

/** stores テーブルから起動時に必要な分だけ抜いたもの。 */
export interface StoreOption {
  id: string;
  name: string;
  is_default: boolean;
}

/** authStore の selectedStore と同じ形。 */
export interface SelectedStore {
  id: string;
  name: string;
}

/**
 * 起動処理の中で店舗を自動決定してよいか判定する。
 *
 * 1つだけのときに限り自動選択する。null を返した場合は (tabs)/_layout が
 * /(auth)/select-store へ送るので、ユーザーが選ぶ・状況を知る画面が出る。
 *
 * 2つ以上あるとき is_default を自動選択しないのは意図的。
 * select-store.tsx が「デフォルト店舗があれば自動選択オプション
 * （ここではユーザーに選ばせる）」としている現在の方針をそのまま守る。
 * 勝手にデフォルトへ入ると、別店舗で作業しているスタッフが
 * 気づかないまま誤った店舗に記録を作ることになる。
 */
export function pickDefaultStore(stores: StoreOption[]): SelectedStore | null {
  if (stores.length !== 1) return null;
  const [store] = stores;
  return { id: store.id, name: store.name };
}
