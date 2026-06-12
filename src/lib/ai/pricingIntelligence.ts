/**
 * テナント固有の「価格インテリジェンス」レイヤ。
 *
 * 過去の成約済み帳票 (請求書 / 領収書) を実績データとして集計し、
 * メニュー (サービス) ごと・車両メーカーごとの実勢価格 (中央値 / P25 / P75) と
 * 成約率を抽出する。これを AI 見積もり生成 (enhancedQuote) の context として渡し、
 * 「相場から外れない」「競争力のある」価格提案を行わせる。
 *
 * deterministic な統計のみを担当し、LLM 呼び出しは行わない (= 安価 & 安定)。
 * 同一テナントからの連続見積もりリクエストで毎回 DB を叩かないよう、
 * 1 時間 TTL のプロセス内メモリキャッシュを持つ。
 *
 * @security 集計は `createTenantScopedAdmin` 経由で必ず tenant_id にスコープする。
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface PricingPattern {
  /** メニュー名 / 明細説明 (元の表記を保持。グルーピングは正規化キーで行う) */
  service_name: string;
  /** 車両メーカー (メーカー固有パターンのとき)。null はメーカー横断のフォールバック。 */
  maker?: string;
  /** このパターンの基となったサンプル件数 (明細行数) */
  sample_count: number;
  /** サンプル unit_price の中央値 */
  median_price: number;
  /** 第 1 四分位 (25 パーセンタイル) */
  p25_price: number;
  /** 第 3 四分位 (75 パーセンタイル) */
  p75_price: number;
  /** 見積もりが請求書に転換した割合 (0–1)。算出不能なら undefined。 */
  acceptance_rate?: number;
}

export interface PricingContext {
  tenant_id: string;
  /** 集計実行時刻 (ISO) */
  computed_at: string;
  patterns: PricingPattern[];
  /** 集計対象になった成約済み帳票の件数 */
  total_invoices_analyzed: number;
}

/** 成約 (= 実績) とみなす帳票ステータス */
const ACCEPTED_STATUSES = ["accepted", "paid"] as const;
/** 成約 (= 実績) とみなす帳票タイプ */
const ACCEPTED_DOC_TYPES = ["invoice", "receipt"] as const;
/** 上位何件のパターンを返すか */
const MAX_PATTERNS = 50;
/** キャッシュ TTL (ms) */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/** 成約シグナル: 見積もり→請求書の相関を見る窓 (日) */
const ACCEPTANCE_CORRELATION_DAYS = 90;

interface CacheEntry {
  context: PricingContext;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

/** テスト / 強制再計算用にキャッシュを破棄する。 */
export function clearPricingContextCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/** 文字列 → 正規化グルーピングキー (前後空白除去 + 小文字化)。 */
function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

/** ソート済み数値配列の p パーセンタイル (0–1) を線形補間で求める。 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** 帳票 1 件の items_json から { description, unit_price, quantity } を抽出する。 */
function extractLines(rawItems: unknown): Array<{ description: string; unit_price: number; quantity: number }> {
  const lines: Array<{ description: string; unit_price: number; quantity: number }> = [];
  if (!Array.isArray(rawItems)) return lines;
  for (const it of rawItems) {
    if (!it || typeof it !== "object") continue;
    const rec = it as Record<string, unknown>;
    // documents.items_json は実装によって `description` または `name` を使う。両対応。
    const descRaw =
      typeof rec.description === "string" ? rec.description : typeof rec.name === "string" ? rec.name : "";
    const description = descRaw.trim();
    const unitPrice = typeof rec.unit_price === "number" ? rec.unit_price : 0;
    const quantity = typeof rec.quantity === "number" && rec.quantity > 0 ? rec.quantity : 1;
    // 小計 / 見出し / メモ行 (type !== "line") は集計対象外。type 無しは line とみなす。
    const type = typeof rec.type === "string" ? rec.type : "line";
    if (type !== "line") continue;
    if (description && Number.isFinite(unitPrice) && unitPrice > 0) {
      lines.push({ description, unit_price: unitPrice, quantity });
    }
  }
  return lines;
}

interface DocRow {
  id: string;
  doc_type: string;
  status: string;
  customer_id: string | null;
  vehicle_id: string | null;
  issued_at: string | null;
  items_json: unknown;
}

interface PatternAcc {
  service_name: string; // 代表表記 (最初に出会った元表記)
  maker?: string;
  prices: number[];
}

/**
 * 成約済み帳票の明細を (正規化サービス名 × メーカー) でグルーピングし、
 * 価格分布の統計を持つアキュムレータ Map を構築する。
 *
 * メーカー固有パターンに加え、メーカー横断 (maker=undefined) の
 * フォールバックパターンも常に積む (見積もり側で車種一致が無いケース用)。
 */
function accumulatePatterns(docs: DocRow[], makerByVehicle: Map<string, string>): Map<string, PatternAcc> {
  const acc = new Map<string, PatternAcc>();
  for (const doc of docs) {
    const maker = doc.vehicle_id ? makerByVehicle.get(doc.vehicle_id) : undefined;
    for (const line of extractLines(doc.items_json)) {
      const nameKey = normalizeKey(line.description);
      if (!nameKey) continue;

      // メーカー横断フォールバック
      const fallbackKey = `${nameKey}::*`;
      const fb = acc.get(fallbackKey) ?? { service_name: line.description, prices: [] };
      fb.prices.push(line.unit_price);
      acc.set(fallbackKey, fb);

      // メーカー固有
      if (maker) {
        const makerKey = `${nameKey}::${normalizeKey(maker)}`;
        const mk = acc.get(makerKey) ?? { service_name: line.description, maker, prices: [] };
        mk.prices.push(line.unit_price);
        acc.set(makerKey, mk);
      }
    }
  }
  return acc;
}

/**
 * doc_type='estimate' と成約済み請求書を顧客単位で突き合わせ、
 * 「見積もり後 N 日以内に同一顧客の請求書が存在するか」で成約率を近似する。
 *
 * 戻り値: 正規化サービス名 → acceptance_rate(0–1)。
 * (メーカー粒度までは見ず、サービス名粒度の粗い近似に留める。)
 */
function computeAcceptanceRates(estimates: DocRow[], acceptedDocs: DocRow[]): Map<string, number> {
  // 顧客ごとの成約日時リスト
  const acceptedByCustomer = new Map<string, number[]>();
  for (const d of acceptedDocs) {
    if (!d.customer_id || !d.issued_at) continue;
    const t = Date.parse(d.issued_at);
    if (Number.isNaN(t)) continue;
    const arr = acceptedByCustomer.get(d.customer_id) ?? [];
    arr.push(t);
    acceptedByCustomer.set(d.customer_id, arr);
  }

  const windowMs = ACCEPTANCE_CORRELATION_DAYS * 24 * 60 * 60 * 1000;
  // サービス名 → { total, converted }
  const tally = new Map<string, { total: number; converted: number }>();

  for (const est of estimates) {
    const estTime = est.issued_at ? Date.parse(est.issued_at) : NaN;
    const hasFollowUpInvoice =
      !Number.isNaN(estTime) &&
      est.customer_id != null &&
      (acceptedByCustomer.get(est.customer_id) ?? []).some((t) => t >= estTime && t - estTime <= windowMs);

    const seen = new Set<string>();
    for (const line of extractLines(est.items_json)) {
      const key = normalizeKey(line.description);
      if (!key || seen.has(key)) continue; // 同一見積もり内の重複明細は 1 回だけ数える
      seen.add(key);
      const cur = tally.get(key) ?? { total: 0, converted: 0 };
      cur.total += 1;
      if (hasFollowUpInvoice) cur.converted += 1;
      tally.set(key, cur);
    }
  }

  const rates = new Map<string, number>();
  for (const [key, { total, converted }] of tally) {
    if (total > 0) rates.set(key, converted / total);
  }
  return rates;
}

/**
 * テナントの価格インテリジェンス context を構築する。
 *
 * 1. 直近 `windowDays` 日の成約済み帳票 (invoice/receipt × accepted/paid) を取得
 * 2. 同期間の見積もり (estimate) を取得し、顧客単位で成約率を近似
 * 3. items_json を展開し、(サービス名 × メーカー) ごとに median/p25/p75 を算出
 * 4. sample_count 降順で上位 50 パターンを返す
 *
 * 1 時間 TTL のメモリキャッシュを参照する。`force` でバイパス可能。
 *
 * @param tenantId 集計対象テナント
 * @param windowDays 集計窓 (日)。既定 365。
 * @param opts.force true でキャッシュを無視して再計算
 */
export async function buildPricingContext(
  tenantId: string,
  windowDays = 365,
  opts?: { force?: boolean },
): Promise<PricingContext> {
  const now = Date.now();
  if (!opts?.force) {
    const hit = cache.get(tenantId);
    if (hit && now - hit.cachedAt < CACHE_TTL_MS) {
      return hit.context;
    }
  }

  const context = await computePricingContext(tenantId, windowDays);
  cache.set(tenantId, { context, cachedAt: now });
  return context;
}

async function computePricingContext(tenantId: string, windowDays: number): Promise<PricingContext> {
  const { admin, tenantId: scoped } = createTenantScopedAdmin(tenantId);
  const sinceIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const emptyContext: PricingContext = {
    tenant_id: scoped,
    computed_at: new Date().toISOString(),
    patterns: [],
    total_invoices_analyzed: 0,
  };

  // ① 成約済み帳票
  const { data: acceptedRaw, error: accErr } = await admin
    .from("documents")
    .select("id, doc_type, status, customer_id, vehicle_id, issued_at, items_json")
    .eq("tenant_id", scoped)
    .in("doc_type", ACCEPTED_DOC_TYPES as unknown as string[])
    .in("status", ACCEPTED_STATUSES as unknown as string[])
    .gte("issued_at", sinceIso)
    .order("issued_at", { ascending: false })
    .limit(2000);

  if (accErr) {
    logger.error("pricingIntelligence: accepted documents query failed", { error: accErr.message });
    return emptyContext;
  }
  const acceptedDocs = (acceptedRaw ?? []) as DocRow[];
  if (acceptedDocs.length === 0) {
    return emptyContext;
  }

  // ② 見積もり (成約率近似用)。失敗しても致命ではないので best-effort。
  const { data: estimateRaw } = await admin
    .from("documents")
    .select("id, doc_type, status, customer_id, vehicle_id, issued_at, items_json")
    .eq("tenant_id", scoped)
    .eq("doc_type", "estimate")
    .gte("issued_at", sinceIso)
    .order("issued_at", { ascending: false })
    .limit(2000);
  const estimateDocs = (estimateRaw ?? []) as DocRow[];

  // ③ 帳票が参照する車両のメーカーを解決
  const vehicleIds = [...new Set(acceptedDocs.map((d) => d.vehicle_id).filter((v): v is string => !!v))];
  const makerByVehicle = new Map<string, string>();
  if (vehicleIds.length > 0) {
    const { data: vehicleRows } = await admin
      .from("vehicles")
      .select("id, maker")
      .eq("tenant_id", scoped)
      .in("id", vehicleIds);
    for (const v of (vehicleRows ?? []) as Array<{ id: string; maker: string | null }>) {
      if (v.maker && v.maker.trim()) makerByVehicle.set(v.id, v.maker.trim());
    }
  }

  // ④ 統計 + 成約率
  const acc = accumulatePatterns(acceptedDocs, makerByVehicle);
  const acceptanceRates = computeAcceptanceRates(estimateDocs, acceptedDocs);

  const patterns: PricingPattern[] = [];
  for (const entry of acc.values()) {
    if (entry.prices.length === 0) continue;
    const sorted = [...entry.prices].sort((a, b) => a - b);
    const nameKey = normalizeKey(entry.service_name);
    const pattern: PricingPattern = {
      service_name: entry.service_name,
      sample_count: sorted.length,
      median_price: Math.round(percentile(sorted, 0.5)),
      p25_price: Math.round(percentile(sorted, 0.25)),
      p75_price: Math.round(percentile(sorted, 0.75)),
    };
    if (entry.maker) pattern.maker = entry.maker;
    const rate = acceptanceRates.get(nameKey);
    if (rate !== undefined) pattern.acceptance_rate = rate;
    patterns.push(pattern);
  }

  // sample_count 降順 → 同数なら median 降順で安定ソート、上位 N
  patterns.sort((a, b) => b.sample_count - a.sample_count || b.median_price - a.median_price);

  return {
    tenant_id: scoped,
    computed_at: new Date().toISOString(),
    patterns: patterns.slice(0, MAX_PATTERNS),
    total_invoices_analyzed: acceptedDocs.length,
  };
}
