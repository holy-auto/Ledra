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

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  AUTOMATION_FIELD_BY_KEY,
  AUTOMATION_SOURCES,
  DEFAULT_FIELD_POLICY,
  isKnownFieldKey,
  isKnownSourceKey,
  type AutomationSourceKey,
  type FieldPolicy,
} from "./fieldCatalog";
import type { DraftCertificateResult } from "@/lib/ai/draftCertificate";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

export interface AiAutomationSettings {
  enabled: boolean;
  fieldPolicies: Record<string, FieldPolicy>;
  /** AI 自己評価値の下限。下回ったフィールドは "suggest" にデモートされる。 */
  confidenceThreshold: number;
  /** ソース key -> 許可 / 不許可。未設定キーはカタログの defaultEnabled に従う。 */
  sourcePolicies: Partial<Record<AutomationSourceKey, boolean>>;
  /** DB から読み込めた / 既定にフォールバックしたかを呼び出し側に伝えるフラグ。 */
  loadedFromDb: boolean;
}

export const DEFAULT_AI_AUTOMATION_SETTINGS: AiAutomationSettings = {
  enabled: true,
  fieldPolicies: {},
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  sourcePolicies: {},
  loadedFromDb: false,
};

function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/**
 * テナントの AI 自動入力設定をロードする。
 *
 * - レコードが無いテナントはデフォルト値を返す (loadedFromDb=true)。
 * - テーブル未作成 (preview deploy 等) はデフォルトに完全フォールバック (loadedFromDb=false)。
 * - サニタイズは catalog 経由なので、永続化されたゴミデータは API 層でも UI 層でも見えない。
 */
export async function loadAiAutomationSettings(tenantId: string): Promise<AiAutomationSettings> {
  const { admin } = createTenantScopedAdmin(tenantId);
  try {
    const { data, error } = await admin
      .from("tenant_ai_automation_settings")
      .select("enabled, field_policies, confidence_threshold, source_policies")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error && isMissingTableError(error)) {
      return { ...DEFAULT_AI_AUTOMATION_SETTINGS };
    }
    if (error || !data) {
      return { ...DEFAULT_AI_AUTOMATION_SETTINGS, loadedFromDb: !error };
    }

    return {
      enabled: data.enabled !== false,
      fieldPolicies: sanitizeFieldPoliciesPersisted(data.field_policies),
      confidenceThreshold: sanitizeConfidenceThreshold(data.confidence_threshold),
      sourcePolicies: sanitizeSourcePoliciesPersisted(data.source_policies),
      loadedFromDb: true,
    };
  } catch {
    return { ...DEFAULT_AI_AUTOMATION_SETTINGS };
  }
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
export function resolveFieldPolicy(
  settings: AiAutomationSettings,
  fieldKey: string,
  confidence?: number,
): FieldPolicy {
  if (!settings.enabled) return "manual";

  const userPolicy = settings.fieldPolicies[fieldKey];
  const def = AUTOMATION_FIELD_BY_KEY.get(fieldKey);
  const policy: FieldPolicy = userPolicy ?? def?.defaultPolicy ?? DEFAULT_FIELD_POLICY;

  if (policy === "auto" && typeof confidence === "number" && confidence < settings.confidenceThreshold) {
    return "suggest";
  }
  return policy;
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
 * confidence は draft 全体のスコアなので、低い場合はすべての "auto" を
 * "suggest" にデモートし、UI が常に確認ステップを挟むようにする。
 */
export function filterDraftByPolicy(
  draft: DraftCertificateResult,
  settings: AiAutomationSettings,
): { draft: DraftCertificateResult; policies: Record<string, FieldPolicy> } {
  const policies: Record<string, FieldPolicy> = {
    "certificate.title": resolveFieldPolicy(settings, "certificate.title", draft.confidence),
    "certificate.description": resolveFieldPolicy(settings, "certificate.description", draft.confidence),
    "certificate.materials": resolveFieldPolicy(settings, "certificate.materials", draft.confidence),
    "certificate.warranty": resolveFieldPolicy(settings, "certificate.warranty", draft.confidence),
    "certificate.work_areas": resolveFieldPolicy(settings, "certificate.work_areas", draft.confidence),
    "certificate.cautions": resolveFieldPolicy(settings, "certificate.cautions", draft.confidence),
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

  for (const [k, fieldKey] of Object.entries(VEHICLE_FIELD_MAP) as [
    keyof VehicleOcrExtracted,
    string | null,
  ][]) {
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
