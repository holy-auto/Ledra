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

/**
 * menu_items.category_large (自由入力) が queryText に部分文字列として含まれるか。
 * オプション提案 (このファイル) と概算見積り (quoteReplyAuto.ts) の両方で使う共有判定。
 *
 * ponytail: category_large はカテゴリ taxonomy (enum/マスタ) が無い自由入力のため部分
 * 文字列一致のみ。天井: 「洗車」を含む無関係な問い合わせ文にも「洗車」カテゴリの品目が
 * マッチしうる。上げる場合は menu_items にカテゴリ taxonomy を導入して置き換える。
 */
export function categoryMatchesQuery(categoryLarge: string | null | undefined, queryText: string): boolean {
  if (!categoryLarge?.trim()) return false;
  return queryText.toLowerCase().includes(categoryLarge.trim().toLowerCase());
}

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
  // カテゴリ一致は categoryMatchesQuery 共有 (AI 側の id 検証で無登録品目の提案は防げるが、
  // 無関係な提案は防げない — ponytail はヘルパー側に記載)。
  const category = params.serviceCategory.trim();
  const categoryMatched = category ? nonDuplicate.filter((m) => categoryMatchesQuery(m.category_large, category)) : [];
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
