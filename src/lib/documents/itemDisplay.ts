/**
 * 帳票明細 1 行の「内容」表示を決める純関数。
 *
 * 帳票フォームは「内容(description)」と「品番(item_code)」を別欄で受け付ける。
 * 品番検索欄に商品名や品番を直接入力し、内容欄を空のまま保存する運用が実在するため、
 * description だけを描画すると入力済みの品番が詳細画面・PDF から丸ごと消えて見える
 * （＝「DB に反映されない／吸い上げられない」と誤認される）。
 *
 * そこで描画側は必ずこの関数を通し、内容が空でも品番を内容として見せる。
 * - description があれば主行に description、品番は従行(code)に回す。
 * - description が空で品番だけあれば、品番を主行に昇格させて不可視にしない。
 * - どちらも無ければ "-"。
 */
export function itemContentLines(item: { description?: string | null; item_code?: string | null }): {
  primary: string;
  code: string | null;
} {
  const desc = (item.description ?? "").trim();
  const code = (item.item_code ?? "").trim();
  if (desc) return { primary: desc, code: code || null };
  if (code) return { primary: code, code: null };
  return { primary: "-", code: null };
}
