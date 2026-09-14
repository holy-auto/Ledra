/**
 * GET /api/admin/follow-up-settings/maintenance-dry-run
 *
 * メンテナンスリマインダー設定のドライラン。指定期間 (default 30 日) 内に
 * 送られる予定の証明書 + 顧客のリストを返す。
 *
 * - 実際には送信しない (notification_logs を汚さない)
 * - 既送信スキップは適用しない (= 純粋に「設定的に」何件対象か見せる)
 * - 顧客 opt-out / 種別別月数は適用する
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { previewMaintenanceTargets, type MaintenancePreviewCertInput } from "@/lib/cron/followUp";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(30),
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const parsed = querySchema.safeParse({ days: url.searchParams.get("days") ?? undefined });
    if (!parsed.success) return apiValidationError("invalid days");
    const { days } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const [settingRes, certsRes] = await Promise.all([
      admin
        .from("follow_up_settings")
        .select("maintenance_reminder_months, maintenance_schedule_by_service")
        .eq("tenant_id", caller.tenantId)
        .maybeSingle(),
      admin
        .from("certificates")
        .select("id, customer_id, customer_name, service_type, created_at")
        .eq("tenant_id", caller.tenantId)
        .neq("status", "void")
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const setting = settingRes.data ?? {
      maintenance_reminder_months: [6, 12],
      maintenance_schedule_by_service: {},
    };
    const certs = certsRes.data ?? [];

    const customerIds = [...new Set(certs.map((c) => c.customer_id).filter(Boolean))] as string[];
    type CustomerRow = {
      id: string;
      name: string | null;
      email: string | null;
      line_user_id: string | null;
      followup_opt_out: boolean | null;
    };
    const customerMap = new Map<string, CustomerRow>();
    if (customerIds.length) {
      const { data: customers } = (await admin
        .from("customers")
        .select("id, name, email, line_user_id, followup_opt_out")
        .in("id", customerIds)) as { data: CustomerRow[] | null };
      for (const c of customers ?? []) customerMap.set(c.id, c);
    }

    const flatCerts: MaintenancePreviewCertInput[] = certs
      .map((cert) => {
        const customer = cert.customer_id ? customerMap.get(cert.customer_id) : undefined;
        if (!customer) return null;
        return {
          certId: cert.id,
          serviceType: cert.service_type ?? null,
          createdAt: cert.created_at,
          customerName: customer.name ?? cert.customer_name ?? null,
          customerEmail: customer.email ?? null,
          customerLineUserId: customer.line_user_id ?? null,
          customerOptOut: !!customer.followup_opt_out,
        } as MaintenancePreviewCertInput;
      })
      .filter((x): x is MaintenancePreviewCertInput => x !== null);

    const items = previewMaintenanceTargets({
      setting,
      certs: flatCerts,
      today: new Date(),
      days,
    });

    return apiJson({
      days,
      total: items.length,
      byChannel: {
        line: items.filter((i) => i.channel === "line").length,
        email: items.filter((i) => i.channel === "email").length,
        none: items.filter((i) => i.channel === "none").length,
      },
      items: items.slice(0, 50), // 最大 50 件まで返す (UI で全部見せるのは過剰)
    });
  } catch (e: unknown) {
    return apiInternalError(e, "maintenance-dry-run");
  }
}
