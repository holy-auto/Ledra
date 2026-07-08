/**
 * GET /api/admin/data-export
 *
 * 個人情報保護法 第33条 (保有個人データの開示) / GDPR 第15条 (アクセス権)
 * 対応: テナント (加盟店) オーナーが、自テナントの保有データ一式を JSON で
 * ダウンロードできる。
 *
 * スコープ:
 *   - tenant 本体 (sso 設定や billing は除外 — 別経路)
 *   - certificates (PII 含む完全カラム)
 *   - customers
 *   - invoices
 *   - vehicles
 *   - reservations
 *   - vehicle_histories (audit)
 *   - tenant_memberships (内部ユーザの user_id だけは含む。auth.users 自体は対象外)
 *
 * 権限: owner ロールのみ。staff / admin に開けると委任スタッフが PII 一括
 *       取得できてしまうため絞り込む。
 *
 * 出力: application/json (Content-Disposition: attachment).
 * サイズ閾値: 5 MB を超える tenant では応答が遅くなる。将来的に QStash で
 * 非同期生成 → Supabase Storage の署名付き URL に切り替える前提。
 *
 * Rate limit: 3 リクエスト / オーナー / 60 分。多重発行を抑制。
 * Audit: vehicle_histories に admin_data_export type で記録。
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiUnauthorized, apiForbidden, apiJson, apiInternalError } from "@/lib/api/response";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExportSection {
  table: string;
  count: number;
  rows: Array<Record<string, unknown>>;
}

async function fetchAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  tenantId: string,
  table: string,
  columns = "*",
  limit = 10_000,
): Promise<ExportSection> {
  const { data, error } = await admin.from(table).select(columns).eq("tenant_id", tenantId).limit(limit);

  if (error) {
    logger.warn("admin/data-export: section query failed", { table, tenantId, error: error.message });
    return { table, count: 0, rows: [] };
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return { table, count: rows.length, rows };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) {
      return apiForbidden("テナントオーナーのみ実行可能です。");
    }

    // Rate limit: 3/h per (tenant, user).
    const rlKey = `data-export:${caller.tenantId}:${caller.userId || getClientIp(req)}`;
    const rl = await checkRateLimit(rlKey, { limit: 3, windowSec: 3600 });
    if (!rl.allowed) {
      return apiJson(
        { error: "rate_limited", message: "エクスポート回数の上限に達しました。1時間後に再度お試しください。" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // Fetch the tenant row itself (single row, separate query).
    const { data: tenantRow } = await admin
      .from("tenants")
      .select(
        "id, slug, name, category, prefecture, contact_email, contact_phone, registration_number, " +
          "stripe_connect_account_id, stripe_connect_onboarded, plan_tier, created_at, updated_at",
      )
      .eq("id", tenantId)
      .maybeSingle();

    const [
      certificates,
      customers,
      customerBranches,
      vehicles,
      invoices,
      reservations,
      vehicleHistories,
      memberships,
      aiSettings,
      aiUsageRecent,
    ] = await Promise.all([
      fetchAll(admin, tenantId, "certificates"),
      fetchAll(admin, tenantId, "customers"),
      // 法人顧客の支店 (住所・電話・担当者などの PII を含む)
      fetchAll(admin, tenantId, "customer_branches"),
      fetchAll(admin, tenantId, "vehicles"),
      fetchAll(admin, tenantId, "invoices"),
      fetchAll(admin, tenantId, "reservations"),
      fetchAll(admin, tenantId, "vehicle_histories", "*", 50_000),
      // memberships: don't leak password hashes; only ids + roles.
      fetchAll(admin, tenantId, "tenant_memberships", "id, tenant_id, user_id, role, created_at, revoked_at"),
      // GDPR: AI 自動入力設定のスナップショット (どんなポリシーで AI が動いていたか)
      fetchAll(
        admin,
        tenantId,
        "tenant_ai_automation_settings",
        "enabled, field_policies, confidence_threshold, source_policies, updated_at, updated_by",
      ),
      // GDPR: AI 利用ログ (直近 1000 件、トークン数 / outcome / confidence)
      fetchAll(
        admin,
        tenantId,
        "ai_usage_logs",
        "endpoint, model, outcome, input_tokens, output_tokens, confidence, latency_ms, created_at",
        1000,
      ),
    ]);

    const generatedAt = new Date().toISOString();
    const filename = `ledra-tenant-export-${tenantId.slice(0, 8)}-${generatedAt.slice(0, 10)}.json`;

    // Audit log — best-effort, must not block the response.
    void (async () => {
      try {
        await admin.from("vehicle_histories").insert({
          tenant_id: tenantId,
          type: "admin_data_export",
          title: "管理者によるテナントデータエクスポート",
          description: `Exported by user ${caller.userId} from IP ${getClientIp(req)}`,
          performed_at: generatedAt,
        });
      } catch (e: unknown) {
        logger.warn("admin/data-export audit log failed", { error: e });
      }
    })();

    const payload = {
      schema_version: "1.0",
      generated_at: generatedAt,
      tenant: tenantRow,
      exported_by: { user_id: caller.userId, role: caller.role },
      sections: {
        certificates,
        customers,
        customer_branches: customerBranches,
        vehicles,
        invoices,
        reservations,
        vehicle_histories: vehicleHistories,
        tenant_memberships: memberships,
        ai_automation_settings: aiSettings,
        ai_usage_logs_recent: aiUsageRecent,
      },
      metadata: {
        notice:
          "本データは個人情報保護法第33条 (保有個人データの開示) および " +
          "GDPR 第15条 (アクセス権) に基づいて出力されました。" +
          "他テナントの情報は含まれていません。",
        excluded:
          "tenant_secrets (暗号化済み) / auth.users (Supabase 直接管理) / " +
          "stripe_customer 詳細 (Stripe ダッシュボード経由で取得) は対象外です。",
      },
    };

    logger.info("admin data export issued", {
      tenantId,
      userId: caller.userId,
      counts: {
        certificates: certificates.count,
        customers: customers.count,
        vehicles: vehicles.count,
        invoices: invoices.count,
        reservations: reservations.count,
      },
    });

    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "admin/data-export");
  }
}
