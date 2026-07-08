/**
 * GET /api/admin/next-touch
 *
 * 顧客に近々連絡すべき理由を 1 つに集約して返す:
 *   - 定期点検・交換 (service_reminders / 日付・距離の両軸)
 *   - 車検満了 (vehicles.inspection_expiry_date)
 *   - 保証満了 (certificates.warranty_period_end)
 *   - 誕生日 (customers.birth_date / lead 日以内)
 *
 * 集約・並べ替え・集計は純ロジック (lib/admin/nextTouch) に委ね、ここは取得のみ。
 * 通知は行わない (現場が「今日誰に連絡するか」を把握するための可視化)。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import {
  type TouchItem,
  daysUntilDate,
  toneForDays,
  channelFor,
  sortTouches,
  summarizeTouches,
} from "@/lib/admin/nextTouch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOON_DAYS = 45; // 何日先まで「まもなく」として拾うか
const OVERDUE_DAYS = 30; // 何日前までの超過を拾うか (古すぎる超過は出さない)
const BIRTHDAY_LEAD = 14; // 誕生日の何日前から拾うか
const MILEAGE_PRE_KM = 5000; // 距離ベースで「あと何 km 以内」を対象にするか

type CustomerRow = {
  id: string;
  name: string | null;
  line_user_id: string | null;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
};
type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function vehicleLabel(v: VehicleRow | undefined): string | null {
  if (!v) return null;
  const base = [v.maker, v.model, v.year].filter(Boolean).join(" ");
  if (!base && !v.plate_display) return null;
  return v.plate_display ? `${base || "車両"} / ${v.plate_display}` : base;
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const today = new Date();
    const soonCeil = ymd(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + SOON_DAYS)),
    );
    const overdueFloor = ymd(
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - OVERDUE_DAYS)),
    );

    // ── 4 ソースを並列取得 ──
    const [svcRes, vehRes, certRes, custRes] = await Promise.all([
      admin
        .from("service_reminders")
        .select("id, customer_id, vehicle_id, service_name, reminder_type, next_due_date, next_due_mileage")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .or("next_due_date.not.is.null,next_due_mileage.not.is.null"),
      admin
        .from("vehicles")
        .select("id, customer_id, maker, model, year, plate_display, inspection_expiry_date")
        .eq("tenant_id", tenantId)
        .not("inspection_expiry_date", "is", null)
        .gte("inspection_expiry_date", overdueFloor)
        .lte("inspection_expiry_date", soonCeil),
      admin
        .from("certificates")
        .select("id, customer_id, vehicle_id, service_type, warranty_period_end")
        .eq("tenant_id", tenantId)
        .neq("status", "void")
        .not("warranty_period_end", "is", null)
        .gte("warranty_period_end", overdueFloor)
        .lte("warranty_period_end", soonCeil),
      admin
        .from("customers")
        .select("id, name, line_user_id, email, phone, birth_date")
        .eq("tenant_id", tenantId)
        .not("birth_date", "is", null)
        .limit(5000),
    ]);

    const firstErr = svcRes.error || vehRes.error || certRes.error || custRes.error;
    if (firstErr) return apiInternalError(firstErr, "next-touch fetch");

    const serviceReminders = (svcRes.data ?? []) as Array<{
      id: string;
      customer_id: string | null;
      vehicle_id: string | null;
      service_name: string;
      reminder_type: "mileage" | "interval_months" | "both";
      next_due_date: string | null;
      next_due_mileage: number | null;
    }>;
    const inspectionVehicles = (vehRes.data ?? []) as Array<
      VehicleRow & { customer_id: string | null; inspection_expiry_date: string }
    >;
    const certificates = (certRes.data ?? []) as Array<{
      id: string;
      customer_id: string | null;
      vehicle_id: string | null;
      service_type: string | null;
      warranty_period_end: string;
    }>;
    const birthdayCustomers = (custRes.data ?? []) as CustomerRow[];

    // ── 顧客連絡先を解決 (誕生日分は取得済み、それ以外の customer_id を補完) ──
    const customerMap = new Map<string, CustomerRow>();
    for (const c of birthdayCustomers) customerMap.set(c.id, c);
    const neededCustomerIds = [
      ...new Set(
        [
          ...serviceReminders.map((r) => r.customer_id),
          ...inspectionVehicles.map((v) => v.customer_id),
          ...certificates.map((c) => c.customer_id),
        ].filter((id): id is string => !!id && !customerMap.has(id)),
      ),
    ];
    if (neededCustomerIds.length > 0) {
      const { data: more } = (await admin
        .from("customers")
        .select("id, name, line_user_id, email, phone, birth_date")
        .in("id", neededCustomerIds)) as { data: CustomerRow[] | null };
      for (const c of more ?? []) customerMap.set(c.id, c);
    }

    // ── 距離軸用: 対象車両の最新走行距離 ──
    const mileageVehicleIds = [
      ...new Set(
        serviceReminders
          .filter((r) => r.reminder_type !== "interval_months" && r.next_due_mileage != null && r.vehicle_id)
          .map((r) => r.vehicle_id as string),
      ),
    ];
    const currentMileage = new Map<string, number>();
    if (mileageVehicleIds.length > 0) {
      const { data: logs } = (await admin
        .from("vehicle_mileage_logs")
        .select("vehicle_id, mileage_km, recorded_at")
        .eq("tenant_id", tenantId)
        .in("vehicle_id", mileageVehicleIds)
        .order("recorded_at", { ascending: false })) as {
        data: Array<{ vehicle_id: string; mileage_km: number }> | null;
      };
      for (const row of logs ?? []) {
        if (!currentMileage.has(row.vehicle_id)) currentMileage.set(row.vehicle_id, row.mileage_km);
      }
    }

    // ── 車両ラベル (service / certificate 用) ──
    const labelVehicleIds = [
      ...new Set(
        [...serviceReminders.map((r) => r.vehicle_id), ...certificates.map((c) => c.vehicle_id)].filter(
          (id): id is string => !!id,
        ),
      ),
    ];
    const vehicleMap = new Map<string, VehicleRow>();
    for (const v of inspectionVehicles) vehicleMap.set(v.id, v);
    const missingVehicleIds = labelVehicleIds.filter((id) => !vehicleMap.has(id));
    if (missingVehicleIds.length > 0) {
      const { data: vs } = (await admin
        .from("vehicles")
        .select("id, maker, model, year, plate_display")
        .in("id", missingVehicleIds)) as { data: VehicleRow[] | null };
      for (const v of vs ?? []) vehicleMap.set(v.id, v);
    }

    const items: TouchItem[] = [];
    const pushFor = (
      customerId: string | null,
      build: (c: CustomerRow) => Omit<TouchItem, "customer_id" | "customer_name" | "channel">,
    ) => {
      if (!customerId) return;
      const c = customerMap.get(customerId);
      if (!c) return;
      const base = build(c);
      items.push({
        ...base,
        customer_id: c.id,
        customer_name: c.name ?? "顧客",
        channel: channelFor(c),
      });
    };

    // 定期点検・交換 (日付軸 + 距離軸)
    for (const r of serviceReminders) {
      // 日付軸
      const dDate = r.reminder_type !== "mileage" ? daysUntilDate(r.next_due_date, today) : null;
      if (dDate != null && dDate >= -OVERDUE_DAYS && dDate <= SOON_DAYS) {
        pushFor(r.customer_id, () => ({
          id: `svc:${r.id}:d`,
          reason: "service",
          title: r.service_name,
          detail: vehicleLabel(r.vehicle_id ? vehicleMap.get(r.vehicle_id) : undefined),
          due_date: r.next_due_date,
          days_until: dDate,
          tone: toneForDays(dDate),
        }));
      }
      // 距離軸 (現走行距離が next_due_mileage - PRE_KM 以上で「今日」扱い)
      if (r.reminder_type !== "interval_months" && r.next_due_mileage != null && r.vehicle_id) {
        const cur = currentMileage.get(r.vehicle_id);
        if (cur != null && cur >= r.next_due_mileage - MILEAGE_PRE_KM) {
          pushFor(r.customer_id, () => ({
            id: `svc:${r.id}:m`,
            reason: "service",
            title: r.service_name,
            detail: `${vehicleLabel(vehicleMap.get(r.vehicle_id as string)) ?? "車両"} / 走行 ${r.next_due_mileage!.toLocaleString("ja-JP")}km 目安`,
            due_date: null,
            days_until: 0,
            tone: "today",
          }));
        }
      }
    }

    // 車検満了
    for (const v of inspectionVehicles) {
      const d = daysUntilDate(v.inspection_expiry_date, today);
      if (d == null) continue;
      pushFor(v.customer_id, () => ({
        id: `insp:${v.id}`,
        reason: "inspection",
        title: "車検満了",
        detail: vehicleLabel(v),
        due_date: v.inspection_expiry_date,
        days_until: d,
        tone: toneForDays(d),
      }));
    }

    // 保証満了
    for (const ct of certificates) {
      const d = daysUntilDate(ct.warranty_period_end, today);
      if (d == null) continue;
      pushFor(ct.customer_id, () => ({
        id: `warr:${ct.id}`,
        reason: "warranty",
        title: "保証満了",
        detail: [ct.service_type, vehicleLabel(ct.vehicle_id ? vehicleMap.get(ct.vehicle_id) : undefined)]
          .filter(Boolean)
          .join(" / "),
        due_date: ct.warranty_period_end,
        days_until: d,
        tone: toneForDays(d),
      }));
    }

    // 誕生日 (今年の誕生日が lead 日以内)
    for (const c of birthdayCustomers) {
      const md = c.birth_date?.slice(5, 10); // MM-DD
      if (!md || !/^\d{2}-\d{2}$/.test(md)) continue;
      const thisYear = `${today.getUTCFullYear()}-${md}`;
      const d = daysUntilDate(thisYear, today);
      if (d == null || d < 0 || d > BIRTHDAY_LEAD) continue;
      pushFor(c.id, () => ({
        id: `bday:${c.id}`,
        reason: "birthday",
        title: "誕生日",
        detail: d === 0 ? "本日" : `${d}日後`,
        due_date: thisYear,
        days_until: d,
        tone: toneForDays(d),
      }));
    }

    const sorted = sortTouches(items);
    return apiJson(
      { items: sorted, summary: summarizeTouches(sorted) },
      { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    return apiInternalError(e, "next-touch GET");
  }
}
