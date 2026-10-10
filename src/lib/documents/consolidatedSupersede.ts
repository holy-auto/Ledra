import type { SupabaseClient } from "@supabase/supabase-js";
import { consolidatedSourceIds } from "@/lib/documents/consolidatedSources";
import { logger } from "@/lib/logger";

const CONSOLIDATED_INTO_KEY = "consolidated_into";
const PRIOR_STATUS_KEY = "status_before_consolidation";

/** 置き換えの対象にする元請求書のステータス（未入金のもの）。入金済は入金記録があるので触らない。
 *  下書きも外す（後から送付されると合算請求書と両方が未入金に乗る）。 */
const SUPERSEDABLE_STATUSES = ["draft", "sent", "overdue"];

/**
 * meta_json のうち、合算の付け外しでサーバだけが書くキーを、クライアント入力から剥がして既存値で上書きする。
 * 剥がさないと、meta_json を丸ごと送る更新でまとめ先が消え（戻せなくなる）、逆に任意の帳票を「合算済」にできる。
 */
export function keepConsolidationKeys(
  clientMeta: Record<string, unknown>,
  existingMeta?: unknown,
  alsoKeep: string[] = [],
): Record<string, unknown> {
  const out = { ...clientMeta };
  const prev = (existingMeta as Record<string, unknown> | null) ?? {};
  for (const k of [CONSOLIDATED_INTO_KEY, PRIOR_STATUS_KEY, ...alsoKeep]) {
    if (k in prev) out[k] = prev[k];
    else delete out[k];
  }
  return out;
}

/**
 * 合算請求書と元の請求書の両方が未入金・売掛・督促に乗る二重計上を防ぐ。
 *
 * 合算請求書が生きている間（取消・削除以外。下書きを含む）は、元の請求書（未入金のもの）を取消扱いにし、
 * まとめ先と元のステータスを meta_json に残す。合算請求書を取消・削除したら元のステータスへ戻す。
 * 何度呼んでも同じ結果になる（作成・ステータス変更・削除のたびに呼ぶ）。取消した合算請求書は戻せない
 * （nextStatusesFor）。戻せると、取消の間に別の合算請求書へまとめ直した請求書を二重に請求する。
 * 納品書は請求ではない（売掛に数えない）ので触らない。
 *
 * ponytail: 下書きの合算請求書の間も元請求書を外すので、下書きのまま放置すると売掛から消えて見える
 *   （作成＝置き換えの意思として扱い、二重計上より取りこぼしの方を選んだ。作り直しは削除で元に戻る）。
 *   元請求書に一部入金があると、合算請求書の金額は入金前の合計のままなので残高が入金分だけ多く出る。
 *
 * 失敗しても合算請求書の操作自体は止めない（ログに残す）。
 */
export async function syncConsolidatedSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  tenantId: string,
  doc: { id: string; doc_type: string; status: string; meta_json?: unknown },
  opts: { deleted?: boolean } = {},
): Promise<void> {
  if (doc.doc_type !== "consolidated_invoice") return;
  const active = !opts.deleted && doc.status !== "cancelled";
  const now = new Date().toISOString();

  if (active) {
    const ids = consolidatedSourceIds(doc.meta_json);
    if (ids.length === 0) return;
    const { data, error } = await admin
      .from("documents")
      .select("id, status, meta_json")
      .in("id", ids)
      .eq("tenant_id", tenantId)
      .eq("doc_type", "invoice")
      .in("status", SUPERSEDABLE_STATUSES);
    if (error) {
      logger.error("[consolidatedSupersede] load sources failed", { tenantId, docId: doc.id, err: error.message });
      return;
    }
    for (const s of (data ?? []) as { id: string; status: string; meta_json: unknown }[]) {
      const meta = (s.meta_json as Record<string, unknown> | null) ?? {};
      const { error: upErr } = await admin
        .from("documents")
        .update({
          status: "cancelled",
          meta_json: { ...meta, [CONSOLIDATED_INTO_KEY]: doc.id, [PRIOR_STATUS_KEY]: s.status },
          updated_at: now,
        })
        .eq("id", s.id)
        .eq("tenant_id", tenantId)
        // 読んだ後に入金済へ変わった請求書は取消にしない
        .eq("status", s.status);
      if (upErr) logger.error("[consolidatedSupersede] supersede failed", { tenantId, id: s.id, err: upErr.message });
    }
    return;
  }

  const { data, error } = await admin
    .from("documents")
    .select("id, status, meta_json")
    .eq("tenant_id", tenantId)
    .eq(`meta_json->>${CONSOLIDATED_INTO_KEY}`, doc.id);
  if (error) {
    logger.error("[consolidatedSupersede] load superseded failed", { tenantId, docId: doc.id, err: error.message });
    return;
  }
  for (const s of (data ?? []) as { id: string; status: string; meta_json: unknown }[]) {
    const meta = { ...((s.meta_json as Record<string, unknown> | null) ?? {}) };
    const prior = meta[PRIOR_STATUS_KEY];
    delete meta[CONSOLIDATED_INTO_KEY];
    delete meta[PRIOR_STATUS_KEY];
    const { error: upErr } = await admin
      .from("documents")
      .update({
        status: typeof prior === "string" && SUPERSEDABLE_STATUSES.includes(prior) ? prior : "sent",
        meta_json: meta,
        updated_at: now,
      })
      .eq("id", s.id)
      .eq("tenant_id", tenantId)
      .eq("status", "cancelled");
    if (upErr) logger.error("[consolidatedSupersede] restore failed", { tenantId, id: s.id, err: upErr.message });
  }
}
