/**
 * AI 自動入力ポリシーのロード / 解決 / 適用。
 *
 * - `loadAiAutomationSettings(tenantId)`
 *     DB から設定を読み、未マイグレーション環境 / 未保存テナントでも
 *     必ず妥当なデフォルト値を返す。テーブルが存在しないエラーも
 *     吸収するので、本機能は段階リリースしやすい。
 *
 * - `resolveFieldPolicy(settings, fieldKey, confidence?)`
 *     最終的な FieldPolicy を返す。次の順で評価:
 *       1. settings.enabled が false → "manual"
 *       2. settings.field_policies[fieldKey] が未設定なら catalog の defaultPolicy
 *       3. confidence が confidence_threshold を下回ったら "suggest" にデモート
 *
 * - `isSourceAllowed(settings, sourceKey)`
 *     データソースが許可されているか判定 (デフォルト ON / 設定で OFF にできる)。
 *
 * - `filterDraftByPolicy(draft, settings)`
 *     `generateCertificateDraft` の戻り値を policy に従って削る。
 *     "manual" の field は空 / 空配列にして UI が補完しないようにする。
 *
 * すべて純関数 (DB は loader のみ) なので、unit test しやすく、API ルート /
 * cron / バッチから繰り返し呼べる。
 */

import { createTenantScopedAdmin, createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { logger } from "@/lib/logger";
import {
  AUTOMATION_FIELD_BY_KEY,
  AUTOMATION_SOURCES,
  DEFAULT_FIELD_POLICY,
  isKnownFieldKey,
  isKnownSourceKey,
  type AutomationSourceKey,
  type FieldPolicy,
} from "./fieldCatalog";
import { isKnownActionKey, sanitizeAutoActions } from "./actionCatalog";
import type { DraftCertificateResult } from "@/lib/ai/draftCertificate";
import { getCostCapStatus, type CostCapStatus } from "@/lib/ai/costCap";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

export interface AiAutomationSettings {
  enabled: boolean;
  fieldPolicies: Record<string, FieldPolicy>;
  /** AI 自己評価値の下限。下回ったフィールドは "suggest" にデモートされる。 */
  confidenceThreshold: number;
  /** ソース key -> 許可 / 不許可。未設定キーはカタログの defaultEnabled に従う。 */
  sourcePolicies: Partial<Record<AutomationSourceKey, boolean>>;
  /**
   * イベント駆動の自動実行アクション key -> 有効/無効。
   * 未設定キーは既定 OFF。壁3 アクションはここに入っていても無視される。
   */
  autoActions: Record<string, boolean>;
  /** テナント別 AI 月次コスト上限 (円)。null = env 既定に従う。 */
  monthlyCostCapJpy: number | null;
  /**
   * コストキャップの現況 (capJpy / spentJpy / exceeded)。
   * キャップ未設定のときは undefined。UI 表示・監視用。
   */
  costCap?: CostCapStatus;
  /** DB から読み込めた / 既定にフォールバックしたかを呼び出し側に伝えるフラグ。 */
  loadedFromDb: boolean;
}

export const DEFAULT_AI_AUTOMATION_SETTINGS: AiAutomationSettings = {
  enabled: true,
  fieldPolicies: {},
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  sourcePolicies: {},
  autoActions: {},
  monthlyCostCapJpy: null,
  loadedFromDb: false,
};

export interface LoadAiSettingsOptions {
  /**
   * コストキャップ超過時に enabled=false に倒すか (既定 true)。
   * 設定画面の GET/PUT など「設定値そのもの」を見たいときは false にして、
   * 実行時のキャップ判定で表示が歪まないようにする。
   */
  applyCostCap?: boolean;
}

/** テーブル未作成 (マイグレーション未適用) の検出。他ルートの degrade 判定でも使う。 */
export function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/** auto_actions 列だけが無い (部分マイグレーション) 状態を検出する。 */
function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204";
}

/**
 * テナントの AI 自動入力設定をロードする。
 *
 * - レコードが無いテナントはデフォルト値を返す (loadedFromDb=true)。
 * - テーブル未作成 (preview deploy 等) はデフォルトに完全フォールバック (loadedFromDb=false)。
 * - サニタイズは catalog 経由なので、永続化されたゴミデータは API 層でも UI 層でも見えない。
 */
export async function loadAiAutomationSettings(
  tenantId: string,
  opts: LoadAiSettingsOptions = {},
): Promise<AiAutomationSettings> {
  const applyCostCap = opts.applyCostCap !== false;
  const { admin } = createTenantScopedAdmin(tenantId);
  const baseCols = "enabled, field_policies, confidence_threshold, source_policies";
  try {
    let { data, error } = await admin
      .from("tenant_ai_automation_settings")
      .select(`${baseCols}, auto_actions, monthly_cost_cap_jpy`)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // monthly_cost_cap_jpy 列が未作成 (部分マイグレーション) の場合は、まず
    // auto_actions を残したまま cost-cap 列だけ外して再取得する。auto_actions も
    // 無い更に古い環境のときだけ基本列のみに落とす (既存の opt-in を失わせない)。
    if (error && isMissingColumnError(error)) {
      ({ data, error } = await admin
        .from("tenant_ai_automation_settings")
        .select(`${baseCols}, auto_actions`)
        .eq("tenant_id", tenantId)
        .maybeSingle());

      if (error && isMissingColumnError(error)) {
        ({ data, error } = await admin
          .from("tenant_ai_automation_settings")
          .select(baseCols)
          .eq("tenant_id", tenantId)
          .maybeSingle());
      }
    }

    if (error && isMissingTableError(error)) {
      return { ...DEFAULT_AI_AUTOMATION_SETTINGS };
    }
    if (error || !data) {
      const settings = { ...DEFAULT_AI_AUTOMATION_SETTINGS, loadedFromDb: !error };
      // 設定行が無いテナントでも、グローバル env キャップが設定されていれば
      // costCap 状態を付けて返す (applyCostCap=false でも状態は表示用に算出し、
      // enabled=false への enforce のみ skip する)。
      return await withCostCap(tenantId, settings, applyCostCap);
    }

    const settings: AiAutomationSettings = {
      enabled: data.enabled !== false,
      fieldPolicies: sanitizeFieldPoliciesPersisted(data.field_policies),
      confidenceThreshold: sanitizeConfidenceThreshold(data.confidence_threshold),
      sourcePolicies: sanitizeSourcePoliciesPersisted(data.source_policies),
      autoActions: sanitizeAutoActions((data as { auto_actions?: unknown }).auto_actions),
      monthlyCostCapJpy: sanitizeCostCapJpy((data as { monthly_cost_cap_jpy?: unknown }).monthly_cost_cap_jpy),
      loadedFromDb: true,
    };
    // costCap 状態は常に算出して付与する (表示・監視用)。
    // applyCostCap=true のときだけ超過で enabled=false に倒す。
    return await withCostCap(tenantId, settings, applyCostCap);
  } catch {
    return { ...DEFAULT_AI_AUTOMATION_SETTINGS };
  }
}

/**
 * settings にコストキャップ状態を付与する。
 * - キャップは既定 (`DEFAULT_MONTHLY_COST_CAP_JPY`) があるので、env・テナント個別が
 *   未設定でも常に算出される。`getCostCapStatus` が null を返すのは既定を 0 に
 *   戻したときだけ（2026-09-04 以前は本番が常にこの状態で、ブレーキが効いていなかった）。
 * - 超過かつ enforce=true のとき enabled=false に倒す (= 一時停止)。
 * - Redis 不在 / 失敗時は spent=0 扱いで fail-open (停止しない)。
 */
async function withCostCap(
  tenantId: string,
  settings: AiAutomationSettings,
  enforce = true,
): Promise<AiAutomationSettings> {
  try {
    const status = await getCostCapStatus(tenantId, settings.monthlyCostCapJpy);
    if (!status) return settings;
    settings.costCap = status;
    if (enforce && status.exceeded) settings.enabled = false;
  } catch {
    /* fail-open: キャップ判定不能なら従来どおり */
  }
  return settings;
}

function sanitizeCostCapJpy(input: unknown): number | null {
  if (input == null) return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function sanitizeFieldPoliciesPersisted(input: unknown): Record<string, FieldPolicy> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, FieldPolicy> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isKnownFieldKey(k)) continue;
    if (v === "auto" || v === "suggest" || v === "manual") {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeSourcePoliciesPersisted(input: unknown): Partial<Record<AutomationSourceKey, boolean>> {
  const out: Partial<Record<AutomationSourceKey, boolean>> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isKnownSourceKey(k)) continue;
    if (typeof v !== "boolean") continue;
    out[k] = v;
  }
  return out;
}

function sanitizeConfidenceThreshold(input: unknown): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return DEFAULT_CONFIDENCE_THRESHOLD;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * 単一フィールドの最終 policy を返す。
 *
 * confidence を省略 (undefined) するとデモートは行わない (UI 設定一覧の表示用)。
 * confidence を渡すと閾値未満で "auto" → "suggest" にデモートされる
 * ("manual" はデモートしない: そもそも AI を呼ばないため)。
 */
export function resolveFieldPolicy(settings: AiAutomationSettings, fieldKey: string, confidence?: number): FieldPolicy {
  if (!settings.enabled) return "manual";

  const userPolicy = settings.fieldPolicies[fieldKey];
  const def = AUTOMATION_FIELD_BY_KEY.get(fieldKey);
  let policy: FieldPolicy = userPolicy ?? def?.defaultPolicy ?? DEFAULT_FIELD_POLICY;

  if (policy === "auto" && typeof confidence === "number" && confidence < settings.confidenceThreshold) {
    return "suggest";
  }
  return policy;
}

/**
 * イベント駆動の auto-action を「人の操作なしで自動実行してよいか」判定する。
 *
 * 次をすべて満たすときだけ true:
 *   1. settings.enabled (グローバル ON)
 *   2. 壁3 (NEVER_AUTO_ACTIONS) でない — 証明書発行 / 課金 / 外向き送付などは常に false
 *   3. カタログに存在する既知アクション
 *   4. settings.autoActions[key] === true (テナントが明示的に opt-in)
 *
 * 未設定は false。opt-in しない限り何も自動実行しない (既存挙動を勝手に変えない)。
 */
export function resolveAutoAction(settings: AiAutomationSettings, actionKey: string): boolean {
  if (!settings.enabled) return false;
  if (!isKnownActionKey(actionKey)) return false;
  return settings.autoActions?.[actionKey] === true;
}

export function isSourceAllowed(settings: AiAutomationSettings, source: AutomationSourceKey): boolean {
  if (!settings.enabled) return false;
  const explicit = settings.sourcePolicies[source];
  if (typeof explicit === "boolean") return explicit;
  const def = AUTOMATION_SOURCES.find((s) => s.key === source);
  return def?.defaultEnabled ?? true;
}

/**
 * 証明書下書きを policy で削る。
 *
 * "manual" の field は空白に戻され、UI が自動入力ボタンを押しても
 * 該当欄に値を流し込まない。"auto" / "suggest" は出力に残す
 * (suggest/auto の区別はクライアントの UX 演出のみで、サーバ側では値そのものに違いはない)。
 *
 * confidence はフィールド別 (`draft.fieldConfidence`) があればそれを優先し、
 * 無ければ draft 全体スコア (`draft.confidence`) にフォールバックする。これにより
 * 「説明文は自信があるが材料は曖昧」のようなケースで、曖昧なフィールドだけを
 * "suggest" にデモートし、自信のあるフィールドは "auto" を維持できる。
 */
export function filterDraftByPolicy(
  draft: DraftCertificateResult,
  settings: AiAutomationSettings,
): { draft: DraftCertificateResult; policies: Record<string, FieldPolicy> } {
  const fc: Record<string, number | undefined> = draft.fieldConfidence ?? {};
  const conf = (k: string): number => (typeof fc[k] === "number" ? (fc[k] as number) : draft.confidence);

  const policies: Record<string, FieldPolicy> = {
    "certificate.title": resolveFieldPolicy(settings, "certificate.title", conf("title")),
    "certificate.description": resolveFieldPolicy(settings, "certificate.description", conf("description")),
    "certificate.materials": resolveFieldPolicy(settings, "certificate.materials", conf("materials")),
    "certificate.warranty": resolveFieldPolicy(settings, "certificate.warranty", conf("warranty")),
    "certificate.work_areas": resolveFieldPolicy(settings, "certificate.work_areas", conf("workAreas")),
    "certificate.cautions": resolveFieldPolicy(settings, "certificate.cautions", conf("cautions")),
  };

  return {
    draft: {
      ...draft,
      title: policies["certificate.title"] === "manual" ? "" : draft.title,
      description: policies["certificate.description"] === "manual" ? "" : draft.description,
      materials: policies["certificate.materials"] === "manual" ? [] : draft.materials,
      warrantyCandidates: policies["certificate.warranty"] === "manual" ? [] : draft.warrantyCandidates,
      workAreas: policies["certificate.work_areas"] === "manual" ? [] : draft.workAreas,
      cautions: policies["certificate.cautions"] === "manual" ? "" : draft.cautions,
    },
    policies,
  };
}

/**
 * 車検証 OCR 抽出結果に policy を適用する。
 * "manual" の field は null に戻される。
 */
export interface VehicleOcrExtracted {
  maker: string | null;
  model: string | null;
  year: number | null;
  vin_code: string | null;
  plate_display: string | null;
  expiry_date: string | null;
  fuel_type: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  size_class: string | null;
}

const VEHICLE_FIELD_MAP: Record<keyof VehicleOcrExtracted, string | null> = {
  maker: "vehicle.maker",
  model: "vehicle.model",
  year: "vehicle.year",
  vin_code: "vehicle.vin",
  plate_display: "vehicle.plate_display",
  expiry_date: "vehicle.expiry_date",
  fuel_type: "vehicle.fuel_type",
  length_mm: null,
  width_mm: null,
  height_mm: null,
  size_class: "vehicle.size_class",
};

export function filterVehicleOcrByPolicy(
  extracted: VehicleOcrExtracted,
  settings: AiAutomationSettings,
): { extracted: VehicleOcrExtracted; policies: Record<string, FieldPolicy> } {
  const policies: Record<string, FieldPolicy> = {};
  const out: VehicleOcrExtracted = { ...extracted };

  for (const [k, fieldKey] of Object.entries(VEHICLE_FIELD_MAP) as [keyof VehicleOcrExtracted, string | null][]) {
    if (!fieldKey) continue;
    const policy = resolveFieldPolicy(settings, fieldKey);
    policies[fieldKey] = policy;
    if (policy === "manual") {
      // numeric な year は null、文字列項目も null に統一
      (out as unknown as Record<string, unknown>)[k] = null;
    }
  }

  return { extracted: out, policies };
}

type ServiceRoleAdmin = ReturnType<typeof createServiceRoleAdmin>;

/**
 * テナントが有効 + AI 会話フロー系の自動化のプラン要件を満たすか。
 * LINE 会話フロー・車両撮影自動化など、複数の auto-action 入口で共通のゲート。
 */
export async function tenantEligibleForAiAutomation(admin: ServiceRoleAdmin, tenantId: string): Promise<boolean> {
  const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
  if (!tenant || tenant.is_active === false) return false;
  return canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_inbound_extract");
}

/** スタッフに AI 自動化の「この後の対応」を促す通知 (fail-soft)。 */
export async function notifyStaffOfAiAction(
  admin: ServiceRoleAdmin,
  tenantId: string,
  title: string,
  body: string,
): Promise<boolean> {
  const { error } = await admin.from("notifications").insert({
    tenant_id: tenantId,
    user_id: null,
    notification_type: "ai_action",
    priority: "normal",
    title,
    body,
    link_path: "/admin/messages",
  });
  if (error) {
    logger.warn("[policy] notifyStaffOfAiAction failed", { tenantId, err: error.message });
    return false;
  }
  return true;
}
