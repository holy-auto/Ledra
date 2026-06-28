import "server-only";
import type { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { buildGanttData, type GanttData, type ReservationRow, type RosterMember } from "@/lib/gantt/board";

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

// スタッフ名簿は滅多に変わらないが、live ガントは 10 秒ごとにポーリングされる。
// 名簿だけ短い TTL でキャッシュし、予約データ（毎回フレッシュに取得）と分離して
// Supabase Auth admin API (listUsers) の連打を避ける。プロセス内 (warm instance) のみ有効。
const ROSTER_TTL_MS = 5 * 60_000;
const rosterCache = new Map<string, { roster: RosterMember[]; expires: number }>();

async function loadRoster(tenantId: string): Promise<RosterMember[]> {
  const now = Date.now();
  const cached = rosterCache.get(tenantId);
  if (cached && cached.expires > now) return cached.roster;

  try {
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: memberships } = await admin
      .from("tenant_memberships")
      .select("user_id, role")
      .eq("tenant_id", tenantId);
    // 予約の担当者はどのロール（viewer 含む）にも割り当て得るため、ロールで絞らず
    // 全員を名簿に含める。絞ると viewer への実割当が未アサイン扱いに誤分類される。
    const workers = memberships ?? [];
    let roster: RosterMember[] = [];
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
    // 成功時のみキャッシュ（空名簿も valid な結果としてキャッシュ）。
    rosterCache.set(tenantId, { roster, expires: now + ROSTER_TTL_MS });
    return roster;
  } catch {
    // service-role が使えない / 一時障害ではキャッシュせず空で返し、次回再試行させる。
    return [];
  }
}

/**
 * メカニック稼働ガントのデータを組み立てる。
 *
 * SSR ページ（初期描画）と `/api/admin/gantt`（live ポーリング）で同じロジックを
 * 共有するために抽出した。reservations / customers / vehicles は呼び出し元の
 * RLS スコープ（caller の session）で読み、スタッフ名簿だけは auth.users の列挙が
 * 要るためテナント限定の service-role で読む。
 *
 * @param supabase caller の session に紐づく server client（RLS でテナント分離）
 * @param tenantId 呼び出し元テナント
 * @param dateStr  対象日（YYYY-MM-DD, JST）
 */
export async function loadGanttData(supabase: ServerSupabase, tenantId: string, dateStr: string): Promise<GanttData> {
  // ── 当日の予約 ──
  const { data: rows } = await supabase
    .from("reservations")
    .select(
      "id, title, scheduled_date, start_time, end_time, assigned_user_id, status, progress_pct, customer_id, vehicle_id",
    )
    .eq("tenant_id", tenantId)
    .eq("scheduled_date", dateStr)
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
  // 名簿は TTL キャッシュで取得し、毎ポーリングでの listUsers を避ける。
  const roster = await loadRoster(tenantId);

  return { ...buildGanttData(reservationRows, roster, dateStr), isDemo: false };
}
