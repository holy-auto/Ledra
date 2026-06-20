import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { isAdvancedFeatureVisibleForUser } from "@/lib/features/serverVisibility";
import PageHeader from "@/components/ui/PageHeader";
import GanttBoard from "@/components/admin/gantt/GanttBoard";
import { buildGanttData, todayJst, type ReservationRow, type RosterMember } from "@/lib/gantt/board";

export const dynamic = "force-dynamic";

function roleLabel(role: string): string {
  switch (role) {
    case "owner":
      return "オーナー";
    case "admin":
      return "管理者";
    case "staff":
      return "スタッフ";
    case "viewer":
      return "閲覧者";
    default:
      return "メンバー";
  }
}

/**
 * メカニック稼働ガント（WORKSTREAM C）。
 * 当日の予約を assigned_user_id でスタッフ行に割り当て、08:00–19:00 を 30 分刻みで表示。
 * advanced 機能（既定 OFF）。サイドバー導線は feature catalog で出し分け。
 */
export default async function MechanicGanttPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/mechanic-gantt");

  const tenantId = caller.tenantId;

  // advanced 機能ゲート（既定 OFF）。URL 直叩きでも未 opt-in / テナント無効なら 404。
  if (!(await isAdvancedFeatureVisibleForUser(tenantId, caller.userId, "mechanic-gantt"))) {
    notFound();
  }

  const today = todayJst();

  // ── 当日の予約 ──
  const { data: rows } = await supabase
    .from("reservations")
    .select(
      "id, title, scheduled_date, start_time, end_time, assigned_user_id, status, progress_pct, customer_id, vehicle_id",
    )
    .eq("tenant_id", tenantId)
    .eq("scheduled_date", today)
    .order("start_time", { ascending: true });

  const reservations = rows ?? [];

  // 顧客名・車両ラベルを補完
  const customerIds = [...new Set(reservations.map((r) => r.customer_id).filter(Boolean))] as string[];
  const vehicleIds = [...new Set(reservations.map((r) => r.vehicle_id).filter(Boolean))] as string[];

  const customerMap: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
    (customers ?? []).forEach((c) => {
      customerMap[c.id] = c.name;
    });
  }
  const vehicleMap: Record<string, string> = {};
  if (vehicleIds.length > 0) {
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id, maker, model, year, plate_display")
      .in("id", vehicleIds);
    (vehicles ?? []).forEach((v) => {
      const label = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || "車両";
      vehicleMap[v.id] = v.plate_display ? `${label} / ${v.plate_display}` : label;
    });
  }

  const reservationRows: ReservationRow[] = reservations.map((r) => ({
    id: r.id,
    title: r.title,
    scheduled_date: r.scheduled_date,
    start_time: r.start_time,
    end_time: r.end_time,
    assigned_user_id: r.assigned_user_id,
    status: r.status,
    progress_pct: r.progress_pct,
    customer_name: r.customer_id ? (customerMap[r.customer_id] ?? null) : null,
    vehicle_label: r.vehicle_id ? (vehicleMap[r.vehicle_id] ?? null) : null,
  }));

  // ── スタッフ名簿（表示名は auth.users.user_metadata から） ──
  let roster: RosterMember[] = [];
  try {
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: memberships } = await admin
      .from("tenant_memberships")
      .select("user_id, role")
      .eq("tenant_id", tenantId);
    // 予約の担当者はどのロール（viewer 含む）にも割り当て得る（JobStatusPanel は
    // 全メンバーを候補に出す）ため、ロールで絞らず全員を名簿に含める。絞ると
    // viewer への実割当が未アサイン扱いに誤分類される。
    const workers = memberships ?? [];
    if (workers.length > 0) {
      const {
        data: { users },
      } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const userMap = new Map(
        (users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>).map((u) => [u.id, u]),
      );
      roster = workers.map((m) => {
        const u = userMap.get(m.user_id);
        const meta = u?.user_metadata as Record<string, unknown> | undefined;
        const name = (meta?.display_name as string | undefined) ?? u?.email?.split("@")[0] ?? "メンバー";
        return { user_id: m.user_id, name, sub: roleLabel(m.role ?? "") };
      });
    }
  } catch {
    // service-role が使えない環境ではデモ表示にフォールバック（roster 空）。
    roster = [];
  }

  const built = buildGanttData(reservationRows, roster, today);
  const realData = { ...built, isDemo: false };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="業務"
        title="メカニック稼働管理"
        description="本日のシフトを 30 分刻みで可視化。予約は担当スタッフ（assigned_user_id）で各行に割り当てられます。"
      />
      <GanttBoard realData={realData} dateStr={today} />
    </div>
  );
}
