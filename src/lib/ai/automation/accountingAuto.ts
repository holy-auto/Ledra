/**
 * 案件 (予約) 登録時に勘定科目を、人の操作なしで自動推定する IO 層。
 *
 * 予約作成ルート (`/api/admin/reservations` POST) から **fire-and-forget** で
 * 呼ばれる。管理者レスポンスを遅らせないため await しない。
 *
 * 段階:
 *   1. settings をロードし accounting.auto_categorize_on_intake が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_accounting) と is_active を確認
 *   3. 予約のメニュー明細 + 勘定マスタから科目を推定し
 *      reservations.ai_accounting_suggestion に「提案」として保存
 *
 * 壁3:
 *   - 保存するのは **提案のみ** (accounting.category は NEVER_AUTO_FIELD)。
 *     帳簿への計上 (確定) は行わない。金額・科目の確定は必ず人が行う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { categorizeAccountingLines, type AccountingAccount } from "@/lib/ai/accountingCategoryEstimate";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoCategorizeAccountingOnIntake } from "./orchestrator";

const AUTO_CATEGORIZE_ENDPOINT = "/api/admin/reservations#auto-accounting-categorize";

/**
 * 既定の勘定科目チャート。
 *
 * 勘定マスタの DB テーブルは無く (チャートは UI 側の既定リスト)、サーバ側の自動推定では
 * この既定チャートに対して rule (keyword) → AI の二段で当てる。クライアントの
 * `AccountingCategorizePanel` の DEFAULT_ACCOUNTS と科目コードを揃えてある
 * (確定は人が行うため、提案の粒度はこの 4 区分で十分)。
 */
const DEFAULT_ACCOUNTING_CHART: AccountingAccount[] = [
  {
    code: "売上高",
    label: "売上高（施工・サービス）",
    keywords: ["コーティング", "施工", "ガラス", "ポリマー", "メンテ", "洗車", "ppf", "ラッピング", "サービス"],
  },
  { code: "部品売上", label: "部品・材料売上", keywords: ["部品", "材料", "パーツ", "フィルム", "用品", "ケミカル"] },
  { code: "立替金", label: "立替金（外注・代行）", keywords: ["立替", "外注", "代行", "陸送", "登録", "車検"] },
  { code: "雑収入", label: "雑収入", keywords: ["雑", "その他", "手数料"] },
];
const DEFAULT_FALLBACK_CODE = "売上高";

interface MenuItem {
  name?: unknown;
  price?: unknown;
  quantity?: unknown;
}

interface ReservationLite {
  menu_items_json?: unknown;
  ai_accounting_suggestion?: unknown;
}

export interface MaybeAutoCategorizeReservationParams {
  tenantId: string;
  reservationId: string;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * 案件登録時にメニュー明細から勘定科目を推定し、提案として保存する。失敗しても投げない。
 */
export async function maybeAutoCategorizeReservationOnIntake(
  params: MaybeAutoCategorizeReservationParams,
): Promise<void> {
  const { tenantId, reservationId } = params;
  try {
    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoCategorizeAccountingOnIntake(settings)) return;

    const admin = createServiceRoleAdmin("AI auto-categorize accounting — reservation intake, fire-and-forget");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_accounting")) return;

    // 予約 + 既存提案を確認 (列未作成なら ai_accounting_suggestion を外して再取得)。
    let reservation: ReservationLite | null = null;
    {
      const sel = await admin
        .from("reservations")
        .select("menu_items_json, ai_accounting_suggestion")
        .eq("id", reservationId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (sel.error && isMissingColumnError(sel.error)) {
        const retry = await admin
          .from("reservations")
          .select("menu_items_json")
          .eq("id", reservationId)
          .eq("tenant_id", tenantId)
          .maybeSingle();
        reservation = (retry.data as ReservationLite | null) ?? null;
      } else {
        reservation = (sel.data as ReservationLite | null) ?? null;
      }
    }
    if (!reservation) return;
    if (reservation.ai_accounting_suggestion) return; // 既に提案済み → 上書きしない

    const menuItems = Array.isArray(reservation.menu_items_json) ? (reservation.menu_items_json as MenuItem[]) : [];
    const lines = menuItems
      .map((m) => {
        const name = typeof m?.name === "string" ? m.name.trim() : "";
        const price = typeof m?.price === "number" ? m.price : 0;
        const qty = typeof m?.quantity === "number" && m.quantity > 0 ? m.quantity : 1;
        return { description: name, amount: price * qty };
      })
      .filter((l) => l.description.length > 0);
    if (lines.length === 0) return; // 明細が無ければ推定しない

    const usage = startAiRouteUsage(AUTO_CATEGORIZE_ENDPOINT);
    const result = await categorizeAccountingLines(lines, DEFAULT_ACCOUNTING_CHART, DEFAULT_FALLBACK_CODE);

    const snapshot = {
      lines: result.lines,
      auto: true,
      generated_at: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("reservations")
      .update({ ai_accounting_suggestion: snapshot })
      .eq("id", reservationId)
      .eq("tenant_id", tenantId);
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[accountingAuto] suggestion update failed", { tenantId, err: upErr.message });
    }

    // 提案の平均確信度を feedbackLoop 用に記録 (科目確定は人が行うため confidence は参考値)。
    const confs = result.lines.map((l) => l.confidence).filter((c): c is number => typeof c === "number");
    const avgConf = confs.length > 0 ? confs.reduce((s, c) => s + c, 0) / confs.length : null;
    usage.record({
      tenantId,
      outcome: "ok",
      confidence: avgConf,
      meta: { auto: true, lines: result.lines.length },
    });
  } catch (e) {
    logger.warn("[accountingAuto] maybeAutoCategorizeReservationOnIntake threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
