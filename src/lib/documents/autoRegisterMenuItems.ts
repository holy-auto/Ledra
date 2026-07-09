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
 * - item_code が入力されていればそれで既存照合、無ければ品目名(完全一致・大小無視)で照合。
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
        unit_price: parseFloat(String(it.unit_price || 0)) || 0,
        cost_price: costPrice != null && !isNaN(costPrice) ? costPrice : null,
        margin_rate: marginRate != null && !isNaN(marginRate) ? marginRate : null,
        tax_category: it.tax_category === 8 ? 8 : 10,
      };
    })
    .filter((c) => c.name.length > 0);

  if (candidates.length === 0) return;

  const codes = candidates.map((c) => c.item_code).filter((c): c is string => !!c);
  const names = candidates.map((c) => c.name);

  const [{ data: byCode }, { data: byName }] = await Promise.all([
    codes.length > 0
      ? admin.from("menu_items").select("item_code").eq("tenant_id", tenantId).in("item_code", codes)
      : Promise.resolve({ data: [] as { item_code: string | null }[] }),
    admin.from("menu_items").select("name").eq("tenant_id", tenantId).in("name", names),
  ]);

  const existingCodes = new Set((byCode ?? []).map((r) => r.item_code));
  const existingNames = new Set((byName ?? []).map((r) => r.name.toLowerCase()));

  const seenInBatch = new Set<string>();
  const toInsert = candidates.filter((c) => {
    const dedupeKey = c.item_code ?? c.name.toLowerCase();
    if (c.item_code ? existingCodes.has(c.item_code) : existingNames.has(c.name.toLowerCase())) return false;
    if (seenInBatch.has(dedupeKey)) return false;
    seenInBatch.add(dedupeKey);
    return true;
  });

  if (toInsert.length === 0) return;

  await admin.from("menu_items").insert(
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
}
