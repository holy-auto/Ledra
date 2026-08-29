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
import { requireAal2OrResponse } from "@/lib/auth/stepUpGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EXPORT_PAGE_SIZE = 1_000;

type ExportSpec = { key: string; table: string; columns?: string; maxRows?: number };

const EXPORT_SPECS: ExportSpec[] = [
  { key: "certificates", table: "certificates" },
  { key: "customers", table: "customers" },
  { key: "customer_branches", table: "customer_branches" },
  { key: "vehicles", table: "vehicles" },
  { key: "invoices", table: "invoices" },
  { key: "reservations", table: "reservations" },
  { key: "vehicle_histories", table: "vehicle_histories" },
  {
    key: "tenant_memberships",
    table: "tenant_memberships",
    columns: "id, tenant_id, user_id, role, created_at, revoked_at",
  },
  {
    key: "ai_automation_settings",
    table: "tenant_ai_automation_settings",
    columns: "enabled, field_policies, confidence_threshold, source_policies, updated_at, updated_by",
  },
  {
    key: "ai_usage_logs_recent",
    table: "ai_usage_logs",
    columns: "endpoint, model, outcome, input_tokens, output_tokens, confidence, latency_ms, created_at",
    maxRows: 1_000,
  },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "owner")) {
      return apiForbidden("テナントオーナーのみ実行可能です。");
    }
    const stepUpDenied = await requireAal2OrResponse(supabase);
    if (stepUpDenied) return stepUpDenied;

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
    // 法定の開示文書なので、取得に失敗したら部分的な内容を出さずに止める
    // （以前は error を捨てており、存在しない列で 400 になっても tenant が null の
    //  まま開示文書が出ていた）
    const { data: tenantRow, error: tenantErr } = await admin
      .from("tenants")
      // 注: tenants に updated_at 列は無い（文字列を連結していたため検査を素通りしていた）
      .select(
        "id, slug, name, category, prefecture, contact_email, contact_phone, registration_number, " +
          "stripe_connect_account_id, stripe_connect_onboarded, plan_tier, created_at",
      )
      .eq("id", tenantId)
      .maybeSingle();
    if (tenantErr) return apiInternalError(tenantErr, "admin/data-export tenant");

    const generatedAt = new Date().toISOString();
    const filename = `ledra-tenant-export-${tenantId.slice(0, 8)}-${generatedAt.slice(0, 10)}.json`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (value: string) => controller.enqueue(encoder.encode(value));
        const counts: Record<string, number> = {};
        try {
          write(
            JSON.stringify({
              schema_version: "1.1",
              generated_at: generatedAt,
              tenant: tenantRow,
              exported_by: { user_id: caller.userId, role: caller.role },
            }).slice(0, -1) + ',"sections":{',
          );

          for (let specIndex = 0; specIndex < EXPORT_SPECS.length; specIndex++) {
            const spec = EXPORT_SPECS[specIndex];
            if (specIndex > 0) write(",");
            write(`${JSON.stringify(spec.key)}:{"table":${JSON.stringify(spec.table)},"rows":[`);

            let written = 0;
            const maximum = spec.maxRows ?? Number.MAX_SAFE_INTEGER;
            while (written < maximum) {
              const from = written;
              const to = Math.min(from + EXPORT_PAGE_SIZE, maximum) - 1;
              const requested = to - from + 1;
              const { data, error } = await admin
                .from(spec.table)
                .select(spec.columns ?? "*")
                .eq("tenant_id", tenantId)
                .range(from, to);
              if (error) throw new Error(`${spec.table} export failed: ${error.message}`);
              const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
              for (const row of rows) {
                if (written > 0) write(",");
                write(JSON.stringify(row));
                written++;
              }
              if (rows.length < requested) break;
            }
            counts[spec.key] = written;
            write(`],"count":${written}}`);
          }

          write(
            `},"metadata":${JSON.stringify({
              notice:
                "本データは個人情報保護法第33条 (保有個人データの開示) および GDPR 第15条 (アクセス権) に基づいて出力されました。他テナントの情報は含まれていません。",
              excluded:
                "tenant_secrets (暗号化済み) / auth.users (Supabase 直接管理) / stripe_customer 詳細 (Stripe ダッシュボード経由で取得) は対象外です。",
            })}}`,
          );
          controller.close();

          await admin.from("vehicle_histories").insert({
            tenant_id: tenantId,
            type: "admin_data_export",
            title: "管理者によるテナントデータエクスポート",
            description: `Exported by user ${caller.userId} from IP ${getClientIp(req)}`,
            performed_at: generatedAt,
          });
          logger.info("admin data export streamed", { tenantId, userId: caller.userId, counts });
        } catch (error) {
          logger.error("admin data export stream failed", { tenantId, error });
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
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
