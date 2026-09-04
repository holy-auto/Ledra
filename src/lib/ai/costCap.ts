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
 * env `AI_MONTHLY_COST_CAP_JPY` → どちらも無ければ既定
 * (`DEFAULT_MONTHLY_COST_CAP_JPY` = テナント1件あたり月1万円)。
 * **設定漏れでブレーキが外れないよう、既定は効く側に倒してある。**
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
 * 上限が設定されていないときの既定 (円)。**テナント1件あたりの月額。**
 *
 * 代表判断 2026-09-04: 1万円。1 コールの概算単価が 2.0 円なので月 5,000 コール相当で、
 * 通常利用 (Haiku で月数百円 = 150〜400 コール) の 25〜60 倍。
 * 「普通に使う分には当たらないが、暴走は止まる」水準。
 *
 * **既定を 0 (無効) にしない理由。** 以前は env 未設定なら 0 に倒しており、
 * 本番でも env・テナント個別上限のどちらも設定されていなかったため、
 * **安全ブレーキが1つも効いていなかった** (2026-09-04 に実測して発覚)。
 * ダッシュボードの設定漏れでブレーキが外れる設計そのものが誤りだったので、
 * **既定を効く側に倒す**。止めたい場合は env に明示的に `0` を入れる。
 */
export const DEFAULT_MONTHLY_COST_CAP_JPY = 10_000;

/**
 * 適用するキャップ (円) を解決する。テナント個別 > env > 既定 の順。
 *
 * env の扱い:
 * - 明示的な `0` は「上限なし」の意思表示として尊重する
 * - 負値・非数は設定ミスなので既定へ倒す (ブレーキが外れる方に倒さない)
 * - 未設定・空文字も既定へ倒す
 */
export function resolveCapJpy(perTenantCapJpy?: number | null): number {
  if (typeof perTenantCapJpy === "number" && perTenantCapJpy > 0) return perTenantCapJpy;
  const raw = process.env.AI_MONTHLY_COST_CAP_JPY;
  if (raw != null && raw.trim() !== "") {
    const envCap = Number(raw);
    if (Number.isFinite(envCap) && envCap >= 0) return envCap;
  }
  return DEFAULT_MONTHLY_COST_CAP_JPY;
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
