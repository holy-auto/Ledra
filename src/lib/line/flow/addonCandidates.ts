/**
 * 会話フローから使うオプション/アドオン提案の取得 (Phase 2)。
 *
 * `quoteDraftCore.ts` と同じ「service-role で簡易にデータ取得 → AI 呼び出し」の
 * IO 層パターン。テナントの登録メニュー (優先) と過去請求実績 (フォールバック) を
 * 取得し、`generateOptionRecommendations` に渡す。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { extractInvoiceLines } from "@/lib/ai/quoteFromVehicle";
import {
  generateOptionRecommendations,
  type OptionMenuCandidate,
  type RecommendedOption,
} from "@/lib/ai/optionRecommend";

type Admin = ReturnType<typeof createServiceRoleAdmin>;

export interface FetchAddonRecommendationsParams {
  vehicle: { maker?: string | null; model?: string | null; size_class?: string | null };
  serviceCategory: string;
  /** 基本見積りの明細名。同一内容をオプションとして再提案しないよう除外する。 */
  baseItemNames: string[];
  model?: string;
}

/** 受注済みの基本見積りに対するオプション候補を取得する。取得失敗時は空配列 (fail-soft)。 */
export async function fetchAddonRecommendations(
  admin: Admin,
  tenantId: string,
  params: FetchAddonRecommendationsParams,
): Promise<{ options: RecommendedOption[]; ai: boolean }> {
  const [menuRes, invoicesRes] = await Promise.all([
    admin
      .from("menu_items")
      .select("id, name, unit_price, category_large")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(100),
    admin
      .from("invoices")
      .select("items_json, total")
      .eq("tenant_id", tenantId)
      .order("issued_at", { ascending: false })
      .limit(20),
  ]);
  if (menuRes.error || invoicesRes.error) return { options: [], ai: false };

  const excludeNames = new Set(params.baseItemNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const allMenu = (menuRes.data as OptionMenuCandidate[] | null) ?? [];
  // 基本見積りと同一名の品目は除外 (同じ内容を「オプション」として二重提案しない)。
  const nonDuplicate = allMenu.filter((m) => !excludeNames.has(m.name.trim().toLowerCase()));
  // ponytail: 施工内容のカテゴリ一致は部分文字列比較のみ (category_large は自由入力の
  // ため taxonomy が無い)。天井: 「洗車」を含む無関係な問い合わせ文にも「洗車」カテゴリの
  // 品目がマッチしうる (AI 側の id 検証で無登録品目の提案は防げるが、無関係な提案は防げ
  // ない)。上げる場合は menu_items にカテゴリ taxonomy (enum/マスタ) を導入して置き換える。
  const category = params.serviceCategory.trim().toLowerCase();
  const categoryMatched = category
    ? nonDuplicate.filter((m) => m.category_large && category.includes(m.category_large.trim().toLowerCase()))
    : [];
  const menuCandidates = (categoryMatched.length > 0 ? categoryMatched : nonDuplicate).slice(0, 10);

  const pastInvoices = ((invoicesRes.data as Array<{ items_json: unknown; total: number | null }> | null) ?? [])
    .map((r) => extractInvoiceLines(r.items_json, r.total))
    .filter((inv) => inv.items.length > 0)
    .slice(0, 5);

  return generateOptionRecommendations(
    { vehicle: params.vehicle, serviceCategory: params.serviceCategory, menuCandidates, pastInvoices },
    { model: params.model },
  );
}
