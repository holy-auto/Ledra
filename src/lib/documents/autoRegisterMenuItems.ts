import { logger } from "@/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

type NewMenuItemCandidate = {
  item_code: string | null;
  name: string;
  unit_price: number;
  cost_price: number | null;
  margin_rate: number | null;
  tax_category: number;
};

/**
 * 帳票の明細行のうち、品目マスタ(menu_items)に未登録のものを自動登録する。
 * - item_code が入力されていればそれで既存照合(大小無視)、無ければ品目名で照合(大小無視)。
 * - 品目マスタから選択した明細は description が "品目名 (説明)" に連結される
 *   (handleMenuItemSelect) ため、名前照合は素の name だけでなくその連結形とも比較する。
 * - 見出し行・小計行(item_type !== "item")や空欄行は対象外。
 * 保存自体を失敗させたくないため、呼び出し側で fire-and-forget (after()) して使う想定。
 */
export async function autoRegisterMenuItems(
  admin: AnySupabaseClient,
  tenantId: string,
  items: ReadonlyArray<Record<string, unknown>>,
): Promise<void> {
  const candidates: NewMenuItemCandidate[] = items
    .filter((it) => (it.item_type ?? "item") === "item")
    .map((it) => {
      const name = String(it.description ?? "").trim();
      const rawItemCode = typeof it.item_code === "string" ? it.item_code.trim() : "";
      const costPrice = it.cost_price != null && it.cost_price !== "" ? parseInt(String(it.cost_price), 10) : null;
      const marginRate = it.margin_rate != null && it.margin_rate !== "" ? parseFloat(String(it.margin_rate)) : null;
      return {
        name,
        item_code: rawItemCode || null,
        unit_price: parseInt(String(it.unit_price || 0), 10) || 0,
        cost_price: costPrice != null && !isNaN(costPrice) ? costPrice : null,
        margin_rate: marginRate != null && !isNaN(marginRate) ? marginRate : null,
        tax_category: it.tax_category === 8 ? 8 : 10,
      };
    })
    .filter((c) => c.name.length > 0);

  if (candidates.length === 0) return;

  // テナントの品目数は数十〜数百件規模のため、既存品目を丸ごと取得して
  // JS 側で照合する(IN 句を複数発行するより単純かつ大小文字/連結名の揺れに強い)。
  const { data: existing, error: fetchError } = await admin
    .from("menu_items")
    .select("name, description, item_code")
    .eq("tenant_id", tenantId);
  if (fetchError) {
    logger.warn("auto_register_menu_items_fetch_failed", { tenantId, error: fetchError.message });
    return;
  }

  const existingCodes = new Set(
    (existing ?? [])
      .map((r) => r.item_code)
      .filter((c): c is string => !!c)
      .map((c) => c.toLowerCase()),
  );
  const existingNameVariants = new Set<string>();
  for (const r of existing ?? []) {
    if (!r.name) continue;
    existingNameVariants.add(r.name.toLowerCase());
    if (r.description) existingNameVariants.add(`${r.name} (${r.description})`.toLowerCase());
  }

  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  const toInsert = candidates.filter((c) => {
    const codeKey = c.item_code ? c.item_code.toLowerCase() : null;
    const nameKey = c.name.toLowerCase();
    const existsInDb = codeKey ? existingCodes.has(codeKey) : existingNameVariants.has(nameKey);
    if (existsInDb) return false;
    // 品番あり/なしの明細が同一帳票内に混在しても同じ品目を二重登録しないよう、
    // 品番だけでなく品目名でもバッチ内の既登録候補と突き合わせる。
    if (codeKey && seenCodes.has(codeKey)) return false;
    if (seenNames.has(nameKey)) return false;
    if (codeKey) seenCodes.add(codeKey);
    seenNames.add(nameKey);
    return true;
  });

  if (toInsert.length === 0) return;

  const { error: insertError } = await admin.from("menu_items").insert(
    toInsert.map((c) => ({
      tenant_id: tenantId,
      name: c.name,
      item_code: c.item_code,
      unit_price: c.unit_price,
      cost_price: c.cost_price ?? 0,
      margin_rate: c.margin_rate,
      tax_category: c.tax_category,
    })),
  );
  if (insertError) {
    // 同時保存で品番の unique 制約に競合した場合など。ログのみ残し、帳票保存自体は失敗させない。
    logger.warn("auto_register_menu_items_insert_failed", { tenantId, error: insertError.message });
  }
}
