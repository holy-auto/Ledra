/**
 * 基幹ソフト連携の Push 取込 (v1 ingest API) 共通基盤。
 *
 * 各店舗が利用する基幹ソフト (車検・整備・販売管理など) が Ledra の
 * `Authorization: Bearer lk_live_...` を用いて顧客 / 車両 / 作業履歴を
 * Ledra へ送り込む。Ledra 側は (tenant_id, source_system, external_ref)
 * で冪等に upsert し、再同期しても重複しない。
 *
 * セキュリティ:
 *   - 認証は tenant_api_keys (resolveTenantApiKey)。鍵に紐づく tenant_id に
 *     スコープを固定するため、ペイロードに tenant_id を含めても無視する。
 *   - 取込先は createTenantScopedAdmin で必ず tenant_id フィルタを掛ける。
 */

import { createServiceRoleAdmin, createTenantScopedAdmin } from "@/lib/supabase/admin";
import { extractBearer, hasAnyScope, resolveTenantApiKey, type TenantApiKeyContext } from "@/lib/tenant-api-keys";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { logger } from "@/lib/logger";

/** 取込スコープ。'*' (全権) でも可。 */
export const INGEST_SCOPES = {
  customers: "customers:write",
  vehicles: "vehicles:write",
  work_history: "work_history:write",
} as const;

export type IngestResource = "customers" | "vehicles" | "work_history";

export interface IngestAuth {
  ctx: TenantApiKeyContext;
}

/**
 * Bearer 鍵を検証し、要求スコープを満たすか確認する。
 * 失敗時は Response (401/403) を返す。
 */
export async function authenticateIngest(
  req: Request,
  requiredScope: string,
): Promise<{ ok: true; ctx: TenantApiKeyContext } | { ok: false; response: Response }> {
  const raw = extractBearer(req);
  if (!raw) return { ok: false, response: apiUnauthorized("APIキーが指定されていません。") };

  const admin = createServiceRoleAdmin("v1 ingest API — pre-auth tenant API key lookup");
  const auth = await resolveTenantApiKey(admin, raw);
  if (!auth.ok) return { ok: false, response: apiUnauthorized("APIキーが無効です。") };

  if (!hasAnyScope(auth.ctx, requiredScope)) {
    return { ok: false, response: apiForbidden(`このAPIキーには ${requiredScope} スコープがありません。`) };
  }
  return { ok: true, ctx: auth.ctx };
}

/**
 * external_ref で batch 内の重複を排除 (後勝ち)。
 * Supabase の upsert は同一 ON CONFLICT キーが batch 内に複数あると失敗するため。
 */
export function dedupeByRef<T extends { external_ref: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(r.external_ref, r);
  return [...map.values()];
}

/** 取込結果サマリ。 */
export interface IngestResult {
  total: number;
  inserted: number;
  updated: number;
  failed: number;
  status: "completed" | "partial" | "failed";
}

/**
 * 取込本体を実行する共通ラッパー。
 *
 * `buildRows` で「DB へ upsert する行」を構築し (外部キー解決などを含む)、
 * `table` / `onConflict` で冪等 upsert する。inserted / updated は既存
 * external_ref を事前取得して算出する。最後に integration_sync_runs へ記録。
 *
 * @returns 取込結果サマリ。失敗時も throw せずサマリで返す。
 */
export async function runIngest(opts: {
  ctx: TenantApiKeyContext;
  resource: IngestResource;
  sourceSystem: string;
  table: "customers" | "vehicles" | "vehicle_histories";
  /** upsert 対象行 (各行に external_ref を含む)。重複は呼び出し側で dedupe 済み想定。 */
  rows: Array<Record<string, unknown> & { external_ref: string }>;
  /** upsert 前に確定済みの失敗件数 (例: 参照先が解決できなかったレコード)。 */
  preFailed?: number;
  /** preFailed の理由 (ログ用)。 */
  preFailedReason?: string;
}): Promise<IngestResult> {
  const { ctx, resource, sourceSystem, table, rows, preFailed = 0, preFailedReason } = opts;
  const { admin, tenantId } = createTenantScopedAdmin(ctx.tenantId);
  const total = rows.length + preFailed;

  let inserted = 0;
  let updated = 0;
  let failed = preFailed;
  let errorMsg: string | null = preFailed > 0 ? (preFailedReason ?? null) : null;

  if (rows.length > 0) {
    // 既存 external_ref を取得して inserted / updated を判定。
    const refs = rows.map((r) => r.external_ref);
    const { data: existing, error: exErr } = await admin
      .from(table)
      .select("external_ref")
      .eq("tenant_id", tenantId)
      .eq("source_system", sourceSystem)
      .in("external_ref", refs);

    if (exErr) {
      logger.warn("ingest existing lookup failed", { table, error: exErr.message });
    }
    const existingSet = new Set((existing ?? []).map((r) => (r as { external_ref: string }).external_ref));

    const { error: upErr } = await admin
      .from(table)
      .upsert(rows, { onConflict: "tenant_id,source_system,external_ref" });

    if (upErr) {
      failed += rows.length;
      errorMsg = upErr.message;
      logger.warn("ingest upsert failed", { table, error: upErr.message });
    } else {
      for (const ref of refs) {
        if (existingSet.has(ref)) updated++;
        else inserted++;
      }
    }
  }

  const status: IngestResult["status"] = failed === 0 ? "completed" : inserted + updated > 0 ? "partial" : "failed";

  // 取込ログ (best-effort)。
  void admin
    .from("integration_sync_runs")
    .insert({
      tenant_id: tenantId,
      source_system: sourceSystem,
      resource,
      api_key_id: ctx.keyId,
      total,
      inserted,
      updated,
      failed,
      status,
      error: errorMsg,
    })
    .then(({ error }) => {
      if (error) logger.debug("integration_sync_runs insert failed", { error: error.message });
    });

  return { total, inserted, updated, failed, status };
}
