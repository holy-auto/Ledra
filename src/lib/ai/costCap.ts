/**
 * AI 月次コストキャップ（暴走課金の安全ブレーキ）。
 *
 * 設計:
 *   - 当月の概算コストを Redis カウンタ `ai-cost:<tenant>:<YYYY-MM>` に積む
 *     (円×100 の整数で保持し浮動小数誤差を避ける)。月キー + ~40日 TTL で自然消滅。
 *   - 1 コールあたりのコストは「エンドポイント別の代表単価」で粗く見積もる。
 *     現状 ai_usage_logs はトークンを別計上していないため、トークン精算ではなく
 *     代表単価ベースの概算で十分機能する安全ブレーキとして実装する。
 *   - キャップ超過の判定は `loadAiAutomationSettings` 内で行い、超過時は
 *     enabled=false 相当に倒して以降の AI 呼び出しを一時停止する。
 *   - Redis 不在 (dev/CI) / 失敗時は必ず fail-open（停止しない・課金を止めない）。
 *
 * キャップ値の解決順: テナント個別 (settings.monthly_cost_cap_jpy) →
 * env `AI_MONTHLY_COST_CAP_JPY` → どちらも無ければ 0 (=キャップ無効)。
 */
import { getRedis } from "@/lib/upstash";
import { logger } from "@/lib/logger";

/** 既定の 1 コールあたり概算コスト (円)。env で調整可。 */
const DEFAULT_CALL_COST_JPY = (() => {
  const n = Number(process.env.AI_DEFAULT_CALL_COST_JPY);
  return Number.isFinite(n) && n > 0 ? n : 2.0;
})();

/** Vision 1 枚あたりの概算コスト (円)。写真品質チェックの積み上げに使う。 */
export const VISION_CALL_COST_JPY = 1.6;

/**
 * 1 リクエストあたりの概算コスト (円)。安全ブレーキ用の粗い見積もり。
 * 個別単価が不明なエンドポイントは Sonnet テキスト相当の既定値にフォールバック。
 */
export function estimateCallCostJpy(endpoint: string): number {
  const e = endpoint.toLowerCase();
  // Haiku 軽量タスク (分類・正規化・スコアリング等)
  if (
    e.includes("classify") ||
    e.includes("sentiment") ||
    e.includes("categorize") ||
    e.includes("normalize") ||
    e.includes("ai-price") ||
    e.includes("pos-deduct") ||
    e.includes("anomaly") ||
    e.includes("ai-link")
  ) {
    return 0.5;
  }
  // Vision 1 枚相当 (出品説明など)
  if (e.includes("description") || e.includes("market")) return VISION_CALL_COST_JPY;
  return DEFAULT_CALL_COST_JPY;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function counterKey(tenantId: string, d = new Date()): string {
  return `ai-cost:${tenantId}:${monthKey(d)}`;
}

/** 当月の概算コストを加算する (best-effort / fire-and-forget 用)。 */
export async function addMonthlyCostJpy(tenantId: string, jpy: number): Promise<void> {
  if (!tenantId || !(jpy > 0)) return;
  const r = getRedis();
  if (!r) return;
  const key = counterKey(tenantId);
  try {
    // 円×100 を整数で積む。
    const next = await r.incrby(key, Math.round(jpy * 100));
    // 新規キー (= 今積んだ分とちょうど一致) には ~40 日 TTL を付与し翌月以降に自然消滅させる。
    if (next === Math.round(jpy * 100)) {
      await r.expire(key, 60 * 60 * 24 * 40);
    }
  } catch (e) {
    logger.warn("ai cost counter incr failed", {
      tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** 当月の概算コスト (円) を取得。Redis 不在 / 失敗時は 0 (fail-open)。 */
export async function getMonthlyCostJpy(tenantId: string): Promise<number> {
  if (!tenantId) return 0;
  const r = getRedis();
  if (!r) return 0;
  try {
    const v = await r.get<number | string | null>(counterKey(tenantId));
    const cents = typeof v === "number" ? v : Number(v ?? 0);
    return Number.isFinite(cents) ? cents / 100 : 0;
  } catch {
    return 0;
  }
}

/**
 * 適用するキャップ (円) を解決する。
 * テナント個別 > env `AI_MONTHLY_COST_CAP_JPY` > 0 (=無効) の順。
 */
export function resolveCapJpy(perTenantCapJpy?: number | null): number {
  if (typeof perTenantCapJpy === "number" && perTenantCapJpy > 0) return perTenantCapJpy;
  const envCap = Number(process.env.AI_MONTHLY_COST_CAP_JPY);
  return Number.isFinite(envCap) && envCap > 0 ? envCap : 0;
}

export interface CostCapStatus {
  capJpy: number;
  spentJpy: number;
  exceeded: boolean;
}

/**
 * キャップ状態を返す。キャップ未設定 (capJpy<=0) のときは null。
 * Redis 不在 / 失敗時は spent=0 として扱う (fail-open: exceeded=false)。
 */
export async function getCostCapStatus(
  tenantId: string,
  perTenantCapJpy?: number | null,
): Promise<CostCapStatus | null> {
  const capJpy = resolveCapJpy(perTenantCapJpy);
  if (capJpy <= 0) return null;
  const spentJpy = await getMonthlyCostJpy(tenantId);
  return { capJpy, spentJpy, exceeded: spentJpy >= capJpy };
}
