/**
 * POST /api/admin/ai/maintenance-suggestion
 *
 * 顧客 + 車両 に対して AI 整備提案メッセージ (件名・本文・緊急度) を生成する。
 *
 * 入力 (deterministic な signals) はこのルートで組み立てる:
 *  - 車両情報 (maker/model/year) と最新走行距離 (vehicle_mileage_logs)
 *  - 有効な service_reminders から「期限超過 / もうすぐ期限」を算出
 *  - 直近の有効な施工証明書 5 件
 *
 * これらを `generateMaintenanceSuggestion` に渡し、文章化のみ LLM に任せる。
 * AI が失敗しても suggestion=null を返すだけで 200 (フェイルオープン)。
 *
 * RBAC: staff 以上。RLS は service-role を tenant にスコープして補強する。
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseBody";
import { resolveCallerFull } from "@/lib/api/auth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { generateMaintenanceSuggestion, type MaintenanceSuggestionInput } from "@/lib/ai/maintenanceSuggestion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional(),
});

/** 日数差 (today から target まで)。target < today なら負数 = 超過。 */
function daysUntil(target: string | null | undefined): number | undefined {
  if (!target) return undefined;
  const t = new Date(`${target}T00:00:00`);
  if (Number.isNaN(t.getTime())) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86_400_000);
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createClient();
  const caller = await resolveCallerFull(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  const parsed = await parseJsonBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { customer_id, vehicle_id } = parsed.data;

  try {
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) 顧客名 + 店舗名
    const [{ data: customer }, { data: tenant }] = await Promise.all([
      admin.from("customers").select("id, name").eq("id", customer_id).eq("tenant_id", caller.tenantId).maybeSingle(),
      admin.from("tenants").select("name").eq("id", caller.tenantId).maybeSingle(),
    ]);
    if (!customer) return apiForbidden("顧客が見つかりません。");

    // 2) 車両情報 (maker/model/year)。vehicle_id 未指定なら顧客の最新車両を採用。
    let vehicle: { id: string; maker: string | null; model: string | null; year: number | null } | null = null;
    if (vehicle_id) {
      const { data } = await admin
        .from("vehicles")
        .select("id, maker, model, year")
        .eq("id", vehicle_id)
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customer_id)
        .maybeSingle();
      vehicle = data ?? null;
    } else {
      const { data } = await admin
        .from("vehicles")
        .select("id, maker, model, year")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customer_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      vehicle = data ?? null;
    }
    const resolvedVehicleId = vehicle?.id ?? null;

    // 3) 最新走行距離 (vehicle_mileage_logs の最新 mileage_km)
    let currentMileage: number | undefined;
    if (resolvedVehicleId) {
      const { data: mileageRow } = await admin
        .from("vehicle_mileage_logs")
        .select("mileage_km")
        .eq("vehicle_id", resolvedVehicleId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mileageRow?.mileage_km != null) currentMileage = Number(mileageRow.mileage_km);
    }

    // 4) active な service_reminders (customer_id OR vehicle_id)。
    //    overdue / days_until_due / km_until_due を算出。
    const reminderFilters = [`customer_id.eq.${customer_id}`];
    if (resolvedVehicleId) reminderFilters.push(`vehicle_id.eq.${resolvedVehicleId}`);
    const { data: reminders } = await admin
      .from("service_reminders")
      .select("service_name, reminder_type, next_due_mileage, next_due_date, status")
      .eq("tenant_id", caller.tenantId)
      .eq("status", "active")
      .or(reminderFilters.join(","))
      .limit(20);

    const dueReminders: MaintenanceSuggestionInput["dueReminders"] = (reminders ?? []).map((r) => {
      const daysLeft = daysUntil(r.next_due_date as string | null);
      const kmLeft =
        r.next_due_mileage != null && currentMileage != null ? Number(r.next_due_mileage) - currentMileage : undefined;
      const overdue = (typeof daysLeft === "number" && daysLeft < 0) || (typeof kmLeft === "number" && kmLeft < 0);
      const type = (
        ["mileage", "interval_months", "both"].includes(String(r.reminder_type)) ? r.reminder_type : "mileage"
      ) as "mileage" | "interval_months" | "both";
      return {
        service_name: String(r.service_name ?? "整備"),
        reminder_type: type,
        overdue,
        days_until_due: daysLeft,
        km_until_due: kmLeft,
      };
    });
    const hasOverdue = dueReminders.some((r) => r.overdue);

    // 5) 直近の有効な施工証明書 5 件 (新しい順)。service_type を service_name にマップ。
    const { data: certs } = await admin
      .from("certificates")
      .select("service_type, created_at")
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", customer_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5);

    const recentCertificates: MaintenanceSuggestionInput["recentCertificates"] = (certs ?? []).map((c) => ({
      service_name: (c.service_type as string | null) ?? undefined,
      created_at: String(c.created_at),
    }));

    // 6) AI 生成 (失敗時 null)
    const suggestion = await generateMaintenanceSuggestion({
      customerName: customer.name ?? "お客様",
      shopName: (tenant?.name as string | undefined) ?? "当店",
      vehicleInfo: {
        maker: vehicle?.maker ?? undefined,
        model: vehicle?.model ?? undefined,
        year: vehicle?.year ?? undefined,
        currentMileage,
      },
      dueReminders,
      recentCertificates,
    });

    return apiOk({
      suggestion,
      reminders_count: dueReminders.length,
      has_overdue: hasOverdue,
    });
  } catch (err) {
    return apiInternalError(err, "POST /api/admin/ai/maintenance-suggestion");
  }
}
