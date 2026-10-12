/**
 * 会計ソフトへの売上仕訳同期エンジン。
 *
 * - 1 テナント × 1 provider 単位で動く `syncTenantToProvider()` が中心。
 * - 手動同期 (UI のボタン) と cron の両方からこの関数を呼ぶ。
 * - `accounting_sync_records` の unique key (tenant_id, provider, source_type,
 *   source_id) で冪等性を担保。同じ書類を 2 度送ったら DB レベルで弾く。
 *
 * 加盟店体験:
 *   - 失敗ケースは `status='failed'` で残し、UI で「◯件確認待ち」と表示。
 *   - 一時的エラー (rate_limited / 5xx) は `status='pending'` で次回再試行。
 *   - access_token 失効は自動で refresh、失敗時のみ status='error' にする。
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { buildTokenWritePayload, isTokenExpiringSoon, readTokensFromRow } from "./tokenStore";
import { documentToSalesEntry, type DocumentRow } from "./mapper";
import { getAccountingProviderClient } from "./registry";
import {
  AccountingApiError,
  type AccountingProvider,
  type AccountingProviderClient,
  type LedraSalesEntry,
} from "./types";
import { logger } from "@/lib/logger";
import { bestEffortWrite } from "@/lib/db/bestEffortWrite";

const SYNC_LOOKBACK_DAYS = 90;
const MAX_RECORDS_PER_RUN = 100;

export interface SyncResult {
  attempted: number;
  synced: number;
  failed: number;
  skipped: number;
  errors: Array<{ source_type: string; source_id: string; message: string }>;
  reason?: "no_integration" | "no_defaults" | "auth_failed";
}

interface IntegrationRow {
  id: string;
  tenant_id: string;
  provider: AccountingProvider;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  external_company_id: string | null;
  default_sales_account_id: string | null;
  default_tax_code: string | null;
  default_partner_id: string | null;
  status: string;
  auto_sync_enabled: boolean;
}

const REASON_LABELS: Record<NonNullable<SyncResult["reason"]>, string> = {
  no_integration: "連携が見つかりません",
  no_defaults: "勘定科目 / 税区分の初期設定が未完了です",
  auth_failed: "アクセストークンが無効です。再連携してください",
};

/**
 * 1 テナント × 1 プロバイダ分の同期を実行。
 * Cron は全テナント分を for-loop でこの関数に流す。
 */
export async function syncTenantToProvider(opts: {
  tenantId: string;
  provider: AccountingProvider;
  triggerType: "manual" | "scheduled";
  triggeredBy?: string | null;
}): Promise<SyncResult> {
  const log = logger.child({
    tenantId: opts.tenantId,
    provider: opts.provider,
    fn: "syncTenantToProvider",
  });
  const admin = createServiceRoleAdmin(`accounting-sync — sync ${opts.provider} for tenant ${opts.tenantId}`);

  // 1) integration 行を取得
  const { data: integration } = await admin
    .from("accounting_integrations")
    .select(
      "id, tenant_id, provider, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, external_company_id, default_sales_account_id, default_tax_code, default_partner_id, status, auto_sync_enabled",
    )
    .eq("tenant_id", opts.tenantId)
    .eq("provider", opts.provider)
    .maybeSingle();

  const row = integration as IntegrationRow | null;

  if (!row || row.status !== "active") {
    return emptyResult("no_integration");
  }
  if (opts.triggerType === "scheduled" && !row.auto_sync_enabled) {
    return emptyResult("no_integration");
  }
  if (!row.external_company_id || !row.default_sales_account_id || !row.default_tax_code) {
    return emptyResult("no_defaults");
  }

  // 2) sync run を作る
  const { data: runInsert } = await admin
    .from("accounting_sync_runs")
    .insert({
      tenant_id: opts.tenantId,
      provider: opts.provider,
      trigger_type: opts.triggerType,
      triggered_by: opts.triggeredBy ?? null,
      status: "running",
    })
    .select("id")
    .single();
  const runId = runInsert?.id as string | undefined;

  const result: SyncResult = { attempted: 0, synced: 0, failed: 0, skipped: 0, errors: [] };

  try {
    // 3) アクセストークン (必要なら refresh)
    const client = getAccountingProviderClient(row.provider);
    const accessToken = await ensureValidAccessToken(row, client, log);
    if (!accessToken) {
      await markIntegrationError(admin, row.id, "auth_failed");
      await finalizeRun(admin, runId, "failed", result, "auth_failed");
      return { ...emptyResult("auth_failed"), errors: result.errors };
    }

    // 4) 対象書類 (paid 請求書) を抽出
    const since = new Date(Date.now() - SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: docs, error: docErr } = await admin
      .from("documents")
      .select("id, doc_type, doc_number, issued_at, status, subtotal, tax, total, tax_rate, tax_breakdown, customer_id")
      .eq("tenant_id", opts.tenantId)
      .eq("doc_type", "invoice")
      .eq("status", "paid")
      .gte("issued_at", since)
      .order("issued_at", { ascending: true })
      .limit(MAX_RECORDS_PER_RUN);

    if (docErr) {
      log.error("documents fetch failed", docErr);
      await finalizeRun(admin, runId, "failed", result, docErr.message);
      return result;
    }

    const docList = (docs ?? []) as DocumentRow[];
    if (docList.length === 0) {
      await finalizeRun(admin, runId, "completed", result);
      await touchLastSynced(admin, row.id);
      return result;
    }

    // 5) 既に同期済みのものを除外
    const sourceIds = docList.map((d) => d.id);
    const { data: existing } = await admin
      .from("accounting_sync_records")
      .select("source_id, status")
      .eq("tenant_id", opts.tenantId)
      .eq("provider", opts.provider)
      .eq("source_type", "document")
      .in("source_id", sourceIds);

    const existingMap = new Map<string, string>();
    for (const e of existing ?? []) {
      existingMap.set(e.source_id as string, e.status as string);
    }

    // 6) 取引先名を customer から引く (1 クエリで済ませる)
    const customerIds = Array.from(new Set(docList.map((d) => d.customer_id).filter(Boolean) as string[]));
    const customerNames = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers } = await admin
        .from("customers")
        .select("id, name")
        .eq("tenant_id", opts.tenantId)
        .in("id", customerIds);
      for (const c of customers ?? []) {
        customerNames.set(c.id as string, (c.name as string) ?? "");
      }
    }

    // 7) 1 件ずつ送る (失敗しても続ける)
    for (const doc of docList) {
      const existingStatus = existingMap.get(doc.id);
      if (existingStatus === "synced") {
        result.skipped++;
        continue;
      }

      result.attempted++;
      const docWithCustomer: DocumentRow = {
        ...doc,
        customer_name: doc.customer_id ? (customerNames.get(doc.customer_id) ?? null) : null,
      };
      const entry = documentToSalesEntry(docWithCustomer);

      try {
        const { externalId } = await client.postSalesEntry({
          accessToken,
          companyId: row.external_company_id,
          entry,
          defaults: {
            salesAccountId: row.default_sales_account_id,
            taxCode: row.default_tax_code,
            partnerId: row.default_partner_id,
          },
        });
        await upsertSyncRecord(admin, {
          tenantId: opts.tenantId,
          provider: opts.provider,
          entry,
          externalId,
          status: "synced",
        });
        result.synced++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const isAuthFail = e instanceof AccountingApiError && e.code === "unauthorized";
        await upsertSyncRecord(admin, {
          tenantId: opts.tenantId,
          provider: opts.provider,
          entry,
          externalId: null,
          status: "failed",
          errorMessage: message,
        });
        result.failed++;
        result.errors.push({ source_type: "document", source_id: doc.id, message });
        if (isAuthFail) {
          await markIntegrationError(admin, row.id, "auth_failed");
          break;
        }
      }
    }

    await finalizeRun(
      admin,
      runId,
      result.failed > 0 ? (result.synced > 0 ? "partial" : "failed") : "completed",
      result,
    );
    await touchLastSynced(admin, row.id);
    return result;
  } catch (e) {
    log.error("syncTenantToProvider unexpected error", e);
    await finalizeRun(admin, runId, "failed", result, e instanceof Error ? e.message : String(e));
    return result;
  }
}

// ─── helpers ───

function emptyResult(reason: SyncResult["reason"]): SyncResult {
  return { attempted: 0, synced: 0, failed: 0, skipped: 0, errors: [], reason };
}

export function reasonLabel(reason: NonNullable<SyncResult["reason"]>): string {
  return REASON_LABELS[reason];
}

async function ensureValidAccessToken(
  row: IntegrationRow,
  client: AccountingProviderClient,
  log: ReturnType<typeof logger.child>,
): Promise<string | null> {
  const tokens = await readTokensFromRow(row, row.provider);
  if (!tokens) return null;

  if (!isTokenExpiringSoon(tokens.expiresAt)) {
    return tokens.accessToken;
  }

  // refresh
  try {
    const refreshed = await client.refreshAccessToken(tokens.refreshToken);
    const payload = await buildTokenWritePayload(refreshed);
    const admin = createServiceRoleAdmin("accounting-sync — refresh OAuth tokens");
    await bestEffortWrite(
      admin
        .from("accounting_integrations")
        .update({
          ...payload,
          last_error: null,
        })
        .eq("id", row.id),
      "accounting_integrations update (ensureValidAccessToken)",
    );
    return refreshed.accessToken;
  } catch (e) {
    log.warn("token refresh failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function upsertSyncRecord(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  args: {
    tenantId: string;
    provider: AccountingProvider;
    entry: LedraSalesEntry;
    externalId: string | null;
    status: "synced" | "failed" | "pending";
    errorMessage?: string;
  },
) {
  const total = args.entry.breakdown.reduce((sum, b) => sum + b.subtotal + b.tax, 0);
  const tax = args.entry.breakdown.reduce((sum, b) => sum + b.tax, 0);

  await bestEffortWrite(
    admin.from("accounting_sync_records").upsert(
      {
        tenant_id: args.tenantId,
        provider: args.provider,
        source_type: args.entry.sourceType,
        source_id: args.entry.sourceId,
        external_id: args.externalId,
        status: args.status,
        error_message: args.errorMessage ?? null,
        amount: total,
        tax_amount: tax,
        synced_at: args.status === "synced" ? new Date().toISOString() : null,
      },
      { onConflict: "tenant_id,provider,source_type,source_id" },
    ),
    "accounting_sync_records upsert (upsertSyncRecord)",
  );
}

async function markIntegrationError(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  integrationId: string,
  reason: string,
) {
  await bestEffortWrite(
    admin.from("accounting_integrations").update({ status: "error", last_error: reason }).eq("id", integrationId),
    "accounting_integrations update (markIntegrationError)",
  );
}

async function finalizeRun(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  runId: string | undefined,
  status: "completed" | "partial" | "failed",
  result: SyncResult,
  topLevelError?: string,
) {
  if (!runId) return;
  await bestEffortWrite(
    admin
      .from("accounting_sync_runs")
      .update({
        status,
        records_attempted: result.attempted,
        records_synced: result.synced,
        records_failed: result.failed,
        records_skipped: result.skipped,
        errors_json: topLevelError ? [{ message: topLevelError }, ...result.errors] : result.errors,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId),
    "accounting_sync_runs update (finalizeRun)",
  );
}

async function touchLastSynced(admin: ReturnType<typeof createServiceRoleAdmin>, integrationId: string) {
  await bestEffortWrite(
    admin.from("accounting_integrations").update({ last_synced_at: new Date().toISOString() }).eq("id", integrationId),
    "accounting_integrations update (touchLastSynced)",
  );
}
