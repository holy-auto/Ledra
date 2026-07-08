/**
 * 顧客の名寄せ・自動作成を 1 箇所に集約するリゾルバ。
 *
 * 車両取込 (ingest) / CSV / 車検証OCR など「外部から来た氏名・連絡先」を
 * 顧客マスタに突合し、
 *   - 信頼度 >= CUSTOMER_AUTO_LINK_THRESHOLD → 既存顧客に連携 (linked)
 *   - 未一致だが氏名あり → 新規顧客を作成して連携 (created)
 *   - 手がかり無し / 氏名無し → 連携しない (skipped)
 * を判断する。判定ロジック自体は `fuzzyMatchCustomer` を再利用する
 * (電話/メール完全一致 → 氏名 Dice 類似度 → 曖昧時のみ AI)。
 *
 * バッチ用途では候補をメモリに保持し、作成した顧客も候補へ追加するため
 * 同一バッチ内で同名が続いても二重作成しない。
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fuzzyMatchCustomer, type CustomerCandidate } from "@/lib/ai/customerFuzzyMatch";
import { logger } from "@/lib/logger";

// tenant-scoped admin (createTenantScopedAdmin) と RLS 済みサーバクライアント
// (createSupabaseServerClient) の双方を受け付けられるよう緩めに型付けする。
type TenantAdmin = SupabaseClient<any, any, any>;

export interface ResolveCustomerQuery {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type ResolveMethod = "linked" | "created" | "skipped";

export interface ResolveCustomerResult {
  customerId: string | null;
  method: ResolveMethod;
  confidence: number;
}

export interface CustomerResolver {
  resolve(query: ResolveCustomerQuery): Promise<ResolveCustomerResult>;
}

/** confidence >= これ で既存顧客に自動連携。未満は (氏名があれば) 新規作成。 */
export const CUSTOMER_AUTO_LINK_THRESHOLD = 0.85;

/**
 * 候補配列を渡してリゾルバを組み立てる (DB 取得は呼び出し側 or ローダに委譲)。
 * テストではモック admin と候補を直接渡せる。
 */
export function createCustomerResolverFromCandidates(
  admin: TenantAdmin,
  tenantId: string,
  candidates: CustomerCandidate[],
  opts?: { ai?: boolean },
): CustomerResolver {
  const cache = [...candidates];
  const ai = opts?.ai !== false;

  return {
    async resolve(query: ResolveCustomerQuery): Promise<ResolveCustomerResult> {
      const name = query.name?.trim() || null;
      const phone = query.phone?.trim() || null;
      const email = query.email?.trim() || null;

      if (!name && !phone && !email) {
        return { customerId: null, method: "skipped", confidence: 0 };
      }

      const match = await fuzzyMatchCustomer({ query: { name, phone, email }, candidates: cache }, { ai });

      if (match.best && match.confidence >= CUSTOMER_AUTO_LINK_THRESHOLD) {
        return { customerId: match.best.candidate.id, method: "linked", confidence: match.confidence };
      }

      // 未一致。氏名が無ければ新規作成もできないのでスキップ。
      if (!name) {
        return { customerId: null, method: "skipped", confidence: match.confidence };
      }

      const { data, error } = await admin
        .from("customers")
        .insert({ tenant_id: tenantId, name, email, phone })
        .select("id, name, name_kana, phone, email")
        .single();

      if (error || !data) {
        logger.warn("[resolveCustomer] auto-create failed", { tenantId, err: error?.message });
        return { customerId: null, method: "skipped", confidence: match.confidence };
      }

      const created = data as CustomerCandidate;
      cache.push(created); // 同一バッチ内の二重作成防止
      return { customerId: created.id, method: "created", confidence: match.confidence };
    },
  };
}

/**
 * テナントの顧客をすべて読み込んでリゾルバを組み立てる。
 * バルク取込の入口で 1 回だけ呼ぶ想定。
 */
export async function createCustomerResolver(
  admin: TenantAdmin,
  tenantId: string,
  opts?: { ai?: boolean },
): Promise<CustomerResolver> {
  const { data, error } = await admin
    .from("customers")
    .select("id, name, name_kana, phone, email")
    .eq("tenant_id", tenantId);

  if (error) {
    logger.warn("[resolveCustomer] candidate load failed", { tenantId, err: error.message });
  }

  return createCustomerResolverFromCandidates(admin, tenantId, (data ?? []) as CustomerCandidate[], opts);
}
