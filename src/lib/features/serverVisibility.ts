import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { FEATURE_BY_KEY, isAdvancedFeatureVisible, sanitizeFeatureKeys } from "./catalog";

/**
 * サーバ側で advanced 機能の可視性を判定する。
 *
 * サイドバーは feature catalog で出し分けているが、URL 直叩きを防ぐため
 * advanced ページのサーバコンポーネントでもこのゲートを通す。
 * - core / 未知キーは常に true（このレイヤでは gate しない）。
 * - テナント無効化 OR ユーザー未 opt-in なら false（＝既定 OFF）。
 * - 読み取り失敗時は false（fail-closed）。
 */
export async function isAdvancedFeatureVisibleForUser(tenantId: string, userId: string, key: string): Promise<boolean> {
  const def = FEATURE_BY_KEY.get(key);
  if (!def || def.tier === "core") return true;

  try {
    const { admin } = createTenantScopedAdmin(tenantId);

    let tenantDisabled = new Set<string>();
    let userVisible = new Set<string>();

    // throwOnError: PostgREST エラー時は例外 → catch で false（fail-closed）。
    // 片方の読み取りだけ失敗してテナント無効化を検証できないまま許可する事故を防ぐ。
    const { data: tRow } = await admin
      .from("tenant_feature_settings")
      .select("disabled_features")
      .eq("tenant_id", tenantId)
      .throwOnError()
      .maybeSingle();
    if (tRow?.disabled_features) tenantDisabled = new Set(sanitizeFeatureKeys(tRow.disabled_features));

    const { data: uRow } = await admin
      .from("user_feature_prefs")
      .select("visible_features")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .throwOnError()
      .maybeSingle();
    if (uRow?.visible_features) userVisible = new Set(sanitizeFeatureKeys(uRow.visible_features));

    return isAdvancedFeatureVisible(key, tenantDisabled, userVisible);
  } catch {
    return false;
  }
}
