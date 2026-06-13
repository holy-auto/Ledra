/**
 * AI 顧客離反予測。
 *
 * 過去 2 年の請求書 (= documents.doc_type='invoice') の発行日から、顧客ごとの
 * 来店頻度を deterministic に算出し、「最終来店からの経過日数」が「平均来店間隔」
 * を大きく超えている顧客を離反リスクとしてスコアリングする。
 *
 * - 計算自体は LLM を使わず数値で確定 (再現性・コスト・速度のため)。
 * - generateChurnInsight だけ AI (Haiku) で 1 文の再来店提案を作る (任意)。
 * - 結果はテナント単位で 1 時間メモリキャッシュ (ダッシュボードの再描画で
 *   毎回フルスキャンしないため)。
 *
 * テナント境界: createTenantScopedAdmin + 明示的 tenant_id 絞り込み。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export type ChurnRiskLevel = "high" | "medium" | "low";

export interface ChurnRiskCustomer {
  customer_id: string;
  name: string | null;
  has_line: boolean;
  visit_count: number;
  last_visit_date: string | null; // YYYY-MM-DD
  days_since_last_visit: number | null;
  avg_visit_interval_days: number | null;
  risk: ChurnRiskLevel;
  /** 並べ替え用スコア (大きいほど高リスク)。 */
  risk_score: number;
}

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const TOP_N = 100;

// しきい値: 経過日数 / 平均来店間隔 の比。
const HIGH_RATIO = 2.5;
const MEDIUM_RATIO = 1.8;

// ─── メモリキャッシュ (テナント単位, TTL 1h) ───
const CACHE_TTL_MS = 60 * 60 * 1000;
type CacheEntry = { at: number; data: ChurnRiskCustomer[] };
const cache = new Map<string, CacheEntry>();

/** テスト用: キャッシュをクリアする。 */
export function __clearChurnCacheForTest(): void {
  cache.clear();
}

type DocRow = { customer_id: string | null; issued_at: string | null };
type CustomerRow = { id: string; name: string | null; line_user_id: string | null };

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr: string, to: Date): number {
  const from = Date.parse(`${fromStr}T00:00:00Z`);
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.round((to.getTime() - from) / 86_400_000));
}

/**
 * 来店日 (発行日) 配列から平均来店間隔を出す。
 * 1 回のみは間隔不明 (null)。
 */
function avgInterval(sortedDates: string[]): number | null {
  if (sortedDates.length < 2) return null;
  let totalDays = 0;
  let n = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = Date.parse(`${sortedDates[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${sortedDates[i]}T00:00:00Z`);
    if (Number.isNaN(prev) || Number.isNaN(cur)) continue;
    totalDays += Math.abs(cur - prev) / 86_400_000;
    n++;
  }
  if (n === 0) return null;
  return Math.round(totalDays / n);
}

function classify(daysSince: number | null, avg: number | null): { risk: ChurnRiskLevel; score: number } {
  // 平均間隔が出せない (来店 1 回) 顧客は、経過日数だけで控えめに評価。
  if (avg == null || avg <= 0) {
    if (daysSince != null && daysSince > 365) return { risk: "medium", score: daysSince / 365 + 0.5 };
    return { risk: "low", score: (daysSince ?? 0) / 1000 };
  }
  if (daysSince == null) return { risk: "low", score: 0 };
  const ratio = daysSince / avg;
  if (ratio > HIGH_RATIO) return { risk: "high", score: ratio + 100 };
  if (ratio > MEDIUM_RATIO) return { risk: "medium", score: ratio + 50 };
  return { risk: "low", score: ratio };
}

/**
 * テナントの離反リスク上位 100 件を返す (risk_score 降順)。
 * 1 時間メモリキャッシュ。
 *
 * テナント境界は内部の createTenantScopedAdmin で担保するため、
 * 呼び出し側から supabase client を渡す必要はない (tenantId のみ)。
 */
export async function computeChurnRisk(tenantId: string): Promise<ChurnRiskCustomer[]> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  const { admin } = createTenantScopedAdmin(tenantId);
  const since = ymd(new Date(Date.now() - TWO_YEARS_MS));

  // 過去 2 年分の請求書発行日を顧客付きで取得。
  const { data: rawDocs, error } = await admin
    .from("documents")
    .select("customer_id, issued_at")
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .not("customer_id", "is", null)
    .gte("issued_at", since)
    .order("issued_at", { ascending: true })
    .limit(20000)
    .returns<DocRow[]>();
  if (error) throw new Error(`computeChurnRisk documents: ${error.message}`);

  // 顧客ごとに来店日 (発行日) を集約。
  const visitsByCustomer = new Map<string, string[]>();
  for (const d of rawDocs ?? []) {
    if (!d.customer_id || !d.issued_at) continue;
    const arr = visitsByCustomer.get(d.customer_id) ?? [];
    arr.push(d.issued_at);
    visitsByCustomer.set(d.customer_id, arr);
  }

  const customerIds = [...visitsByCustomer.keys()];
  if (customerIds.length === 0) {
    cache.set(tenantId, { at: Date.now(), data: [] });
    return [];
  }

  // 顧客名 / LINE 連携を解決 (1000 件ずつチャンク)。
  const customerMap = new Map<string, CustomerRow>();
  for (let i = 0; i < customerIds.length; i += 1000) {
    const chunk = customerIds.slice(i, i + 1000);
    const { data: custs } = await admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("tenant_id", tenantId)
      .in("id", chunk);
    for (const c of (custs ?? []) as CustomerRow[]) customerMap.set(c.id, c);
  }

  const now = new Date();
  const results: ChurnRiskCustomer[] = [];
  for (const [customerId, dates] of visitsByCustomer) {
    const sorted = [...dates].sort();
    const last = sorted[sorted.length - 1] ?? null;
    const daysSince = last ? daysBetween(last, now) : null;
    const avg = avgInterval(sorted);
    const { risk, score } = classify(daysSince, avg);
    const cust = customerMap.get(customerId);
    results.push({
      customer_id: customerId,
      name: cust?.name ?? null,
      has_line: Boolean(cust?.line_user_id),
      visit_count: sorted.length,
      last_visit_date: last,
      days_since_last_visit: daysSince,
      avg_visit_interval_days: avg,
      risk,
      risk_score: score,
    });
  }

  results.sort((a, b) => b.risk_score - a.risk_score);
  const top = results.slice(0, TOP_N);
  cache.set(tenantId, { at: Date.now(), data: top });
  return top;
}

const INSIGHT_SYSTEM_PROMPT = `あなたは自動車施工店の顧客維持を支援するアシスタントです。
顧客の来店履歴の統計 (来店回数・最終来店からの経過日数・平均来店間隔) を受け取り、
店舗スタッフがその顧客に再来店を促すための、丁寧で具体的な提案を「日本語1文」で返してください。

ルール:
- 統計に無い事実を作らない (ハルシネーション禁止)。
- 1 文・60 文字以内。句点 (。) で終える。改行・絵文字は入れない。
- 「〜はいかがでしょうか」「〜のご案内を」など、具体的な次アクションを示す。
`.trim();

/**
 * 顧客 1 名分の再来店提案 (1 文) を AI で生成する。
 * 失敗時 (キー未設定 / 応答破損 / タイムアウト) は null を返してフェイルオープン。
 */
export async function generateChurnInsight(
  customer: { name: string | null },
  stats: {
    visit_count: number;
    days_since_last_visit: number | null;
    avg_visit_interval_days: number | null;
    risk: ChurnRiskLevel;
  },
): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const riskLabel = stats.risk === "high" ? "高" : stats.risk === "medium" ? "中" : "低";
  const facts = [
    `顧客名: ${customer.name ?? "お客様"}`,
    `来店回数: ${stats.visit_count}回`,
    `最終来店からの経過日数: ${stats.days_since_last_visit ?? "不明"}日`,
    `平均来店間隔: ${stats.avg_visit_interval_days ?? "不明"}日`,
    `離反リスク: ${riskLabel}`,
  ].join("\n");

  try {
    const client = getAnthropicClient();
    const msg = await withRetry("anthropic", () =>
      client.messages.create({
        model: AI_MODEL_FAST,
        max_tokens: 160,
        system: INSIGHT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts }],
      }),
    );
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!text) return null;
    // 念のため 1 文に丸める。
    const firstSentence = text.split(/(?<=。)/)[0] ?? text;
    return firstSentence.slice(0, 80);
  } catch (err) {
    console.error("[churnPrediction] insight generation failed:", err);
    return null;
  }
}
