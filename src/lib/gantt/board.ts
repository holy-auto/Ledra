/**
 * Mechanic Gantt — pure domain logic (no JSX / no client imports).
 *
 * 当日のシフト（08:00–19:00）を 30 分刻みで「スタッフ × 時間」に並べるための
 * データ整形・ヘルパ。色は持たず、`kind`（工程ドメイン）だけを返す。表示色は
 * UI 側で WORKSTREAM A のドメイントークン（blue/gold/amber/violet）に対応づける。
 */

export type GanttKind = "work" | "cert" | "parts" | "insure";

export interface GanttStaff {
  id: string;
  name: string;
  sub: string;
  initial: string;
}

export interface GanttCase {
  id: string;
  label: string; // 車両 or タイトル
  sub: string; // 顧客名
  kind: GanttKind;
  tag: string; // 工程・タイトル
  start: number; // 時（例 9.5 = 09:30）
  end: number;
  prog: number; // 0–100
  staffIds: string[];
  /** 予約の生ステータス。ジョブ詳細と同じ POST .../advance で進行できるかの判定に使う。 */
  status: string;
}

export interface GanttUnassigned {
  id: string;
  label: string;
  sub: string;
  kind: GanttKind;
  tag: string;
}

export interface GanttData {
  staff: GanttStaff[];
  cases: GanttCase[];
  unassigned: GanttUnassigned[];
  isDemo: boolean;
  dateLabel: string;
  staffCount: number;
}

// ── シフト定数（UI レイアウトと共有） ──
export const SHIFT_START = 8; // 08:00
export const SHIFT_END = 19; // 19:00
export const SLOTS_PER_HR = 2; // 30 分刻み
export const SLOT_W = 50; // 1 スロット = 50px
export const HOURS_TOTAL = SHIFT_END - SHIFT_START;
export const GRID_W = HOURS_TOTAL * SLOTS_PER_HR * SLOT_W;

/** 工程ドメイン → トークン名（UI 側で var(--accent-*) に解決）。 */
export const KIND_TOKEN: Record<GanttKind, { accent: string; text: string; label: string }> = {
  work: { accent: "--accent-blue", text: "--accent-blue-text", label: "施工" },
  cert: { accent: "--accent-gold", text: "--accent-gold-text", label: "検収" },
  parts: { accent: "--accent-amber", text: "--accent-amber-text", label: "部品待ち" },
  insure: { accent: "--accent-violet", text: "--accent-violet-text", label: "損保" },
};

/** "HH:MM(:SS)" → 時（少数）。null/不正は null。 */
export function parseTimeToHours(t?: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return Number.isFinite(h) ? h : null;
}

/** h（時）→ HH:MM。 */
export function formatHour(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 時 → グリッド X 座標(px)。 */
export function hourToX(h: number): number {
  return (h - SHIFT_START) * SLOTS_PER_HR * SLOT_W;
}

/** JST の現在時刻を時（少数）で返す（NOW ライン用）。 */
export function nowHoursJst(now: Date = new Date()): number {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() + jst.getUTCMinutes() / 60;
}

/** JST の YYYY-MM-DD。 */
export function todayJst(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026.06.20 (金)" 形式の見出し。 */
export function ganttDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const wd = WEEKDAY_JA[new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCDay()];
  return `${dateStr.replace(/-/g, ".")} (${wd})`;
}

/** タイトル/ステータスから工程ドメインを推定。 */
export function deriveKind(title?: string | null, status?: string | null): GanttKind {
  const t = title ?? "";
  if (/検収|証明|検査/.test(t)) return "cert";
  if (/損保|保険|事故|板金/.test(t)) return "insure";
  if (/部品|欠品|入荷待|パーツ待/.test(t)) return "parts";
  if (status === "cancelled") return "work";
  return "work";
}

/** progress_pct があれば優先、無ければステータスから推定。 */
export function deriveProgress(progressPct?: number | null, status?: string | null): number {
  if (typeof progressPct === "number" && progressPct >= 0) return Math.min(100, Math.round(progressPct));
  switch (status) {
    case "completed":
      return 100;
    case "in_progress":
      return 50;
    case "arrived":
      return 10;
    default:
      return 0;
  }
}

/** スタッフの当日稼働率（割当時間 / シフト時間）。 */
export function capacityOf(staffId: string, cases: GanttCase[]): number {
  const hrs = cases.filter((c) => c.staffIds.includes(staffId)).reduce((s, c) => s + Math.max(0, c.end - c.start), 0);
  return Math.min(100, Math.round((hrs / HOURS_TOTAL) * 100));
}

/** 表示名からイニシャル（先頭1文字）。 */
function initialOf(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}

export interface LaidOutCase extends GanttCase {
  /** 重なり回避のためのレーン番号（0 始まり）。 */
  lane: number;
}

/**
 * 1 行内の重なる予約をレーンに振り分ける（貪欲法）。ダブルブッキングを
 * 重ねて隠さず、縦に積んで可視化するためのレイアウト計算。
 */
export function layoutLanes(cases: GanttCase[]): { items: LaidOutCase[]; laneCount: number } {
  const sorted = [...cases].sort((a, b) => a.start - b.start || a.end - b.end);
  const laneEnds: number[] = [];
  const items = sorted.map((c) => {
    let lane = laneEnds.findIndex((end) => end <= c.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(c.end);
    } else {
      laneEnds[lane] = c.end;
    }
    return { ...c, lane };
  });
  return { items, laneCount: Math.max(1, laneEnds.length) };
}

// ── 実データ整形 ──
export interface ReservationRow {
  id: string;
  title?: string | null;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  assigned_user_id?: string | null;
  status?: string | null;
  progress_pct?: number | null;
  customer_name?: string | null;
  vehicle_label?: string | null;
}

export interface RosterMember {
  user_id: string;
  name: string;
  sub?: string;
}

/**
 * 当日の予約 + スタッフ名簿から Gantt データを構築。
 * - 時刻のある割当済み予約はバーに、無い/未割当はサイドの未アサイン列へ。
 * - キャンセルは除外。
 */
export function buildGanttData(
  reservations: ReservationRow[],
  roster: RosterMember[],
  dateStr: string,
): Omit<GanttData, "isDemo"> {
  const active = reservations.filter((r) => r.status !== "cancelled");

  const staff: GanttStaff[] = roster.map((m) => ({
    id: m.user_id,
    name: m.name,
    sub: m.sub ?? "",
    initial: initialOf(m.name),
  }));
  const staffIds = new Set(staff.map((s) => s.id));

  const cases: GanttCase[] = [];
  const unassigned: GanttUnassigned[] = [];

  for (const r of active) {
    const kind = deriveKind(r.title, r.status);
    const label = r.vehicle_label ?? r.title ?? "予約";
    const sub = r.customer_name ?? "";
    const tag = r.title ?? "";
    const start = parseTimeToHours(r.start_time);
    const assigned = Boolean(r.assigned_user_id && staffIds.has(r.assigned_user_id));

    // シフト窓 [SHIFT_START, SHIFT_END] にクランプし、有効な区間だけバー化。
    // 窓外（例 06:00–07:00）や開始時刻なしは未アサイン列へ送る。
    const rawEnd = (() => {
      if (start == null) return null;
      const e = parseTimeToHours(r.end_time);
      return e != null && e > start ? e : start + 1;
    })();
    const cStart = start != null ? Math.max(SHIFT_START, start) : null;
    const cEnd = rawEnd != null ? Math.min(SHIFT_END, rawEnd) : null;

    if (assigned && cStart != null && cEnd != null && cEnd > cStart) {
      cases.push({
        id: r.id,
        label,
        sub,
        kind,
        tag,
        start: cStart,
        end: cEnd,
        prog: deriveProgress(r.progress_pct, r.status),
        staffIds: [r.assigned_user_id as string],
        status: r.status ?? "confirmed",
      });
    } else {
      unassigned.push({ id: r.id, label, sub, kind, tag: tag || "時間未設定" });
    }
  }

  cases.sort((a, b) => a.start - b.start);

  // 当日割当のあるスタッフは必ず表示（行を落とすとそのバーが消えるため）。
  // 空きスタッフは合計 12 行を上限に後ろへ。
  const withWork = new Set(cases.flatMap((c) => c.staffIds));
  const withWorkStaff = staff.filter((s) => withWork.has(s.id));
  const idleStaff = staff.filter((s) => !withWork.has(s.id));
  const shown = [...withWorkStaff, ...idleStaff].slice(0, Math.max(12, withWorkStaff.length));

  return { staff: shown, cases, unassigned, dateLabel: ganttDateLabel(dateStr), staffCount: shown.length };
}

// ── デモデータ（空の店舗 / プレビュー用。handoff プロト相当） ──
export function demoGanttData(dateStr: string): GanttData {
  const staff: GanttStaff[] = [
    { id: "d-yamada", name: "山田 大輔", sub: "主任 · 塗装", initial: "山" },
    { id: "d-sasaki", name: "佐々木 翼", sub: "検収 · 担当", initial: "佐" },
    { id: "d-suzuki", name: "鈴木 健", sub: "PPF", initial: "鈴" },
    { id: "d-nakamura", name: "中村 良太", sub: "塗装 · 補助", initial: "中" },
    { id: "d-sasaki2", name: "伊藤 翔", sub: "一般", initial: "伊" },
  ];
  const cases: GanttCase[] = [
    {
      id: "dc1",
      label: "Porsche Taycan",
      sub: "渡辺 様",
      kind: "work",
      tag: "PPF 施工",
      start: 9.0,
      end: 12.5,
      prog: 65,
      staffIds: ["d-suzuki"],
      status: "in_progress",
    },
    {
      id: "dc2",
      label: "Lexus LX600",
      sub: "三宅 様",
      kind: "work",
      tag: "塗装 5/5",
      start: 8.5,
      end: 14.5,
      prog: 80,
      staffIds: ["d-yamada"],
      status: "in_progress",
    },
    {
      id: "dc3",
      label: "Mercedes EQS",
      sub: "KIKU 様",
      kind: "cert",
      tag: "検収 → 証明書",
      start: 11.5,
      end: 13.0,
      prog: 35,
      staffIds: ["d-sasaki"],
      status: "in_progress",
    },
    {
      id: "dc4",
      label: "BMW M4",
      sub: "山本 様",
      kind: "parts",
      tag: "部品待ち",
      start: 13.0,
      end: 14.5,
      prog: 0,
      staffIds: ["d-suzuki"],
      status: "in_progress",
    },
    {
      id: "dc5",
      label: "Audi RS6",
      sub: "大塚 様",
      kind: "insure",
      tag: "損保 板金 1/3",
      start: 14.0,
      end: 18.5,
      prog: 18,
      staffIds: ["d-yamada"],
      status: "in_progress",
    },
    {
      id: "dc6",
      label: "Range Rover",
      sub: "森下 様",
      kind: "work",
      tag: "コーティング",
      start: 9.5,
      end: 12.0,
      prog: 50,
      staffIds: ["d-nakamura"],
      status: "in_progress",
    },
    {
      id: "dc7",
      label: "Lexus LX600",
      sub: "三宅 様",
      kind: "cert",
      tag: "検収 → 証明書",
      start: 15.0,
      end: 16.5,
      prog: 0,
      staffIds: ["d-sasaki"],
      status: "in_progress",
    },
    {
      id: "dc8",
      label: "Mini Cooper",
      sub: "田所 様",
      kind: "work",
      tag: "板金 仕上",
      start: 13.5,
      end: 17.0,
      prog: 22,
      staffIds: ["d-sasaki2"],
      status: "in_progress",
    },
  ];
  const unassigned: GanttUnassigned[] = [
    { id: "du1", label: "Range Rover", sub: "高橋 様", kind: "cert", tag: "検収待ち · 30 分" },
    { id: "du2", label: "Maserati MC20", sub: "平田 様", kind: "parts", tag: "部品到着 5/24" },
    { id: "du3", label: "Nissan GT-R", sub: "河野 様", kind: "insure", tag: "損保査定 · 240 分" },
  ];
  return { staff, cases, unassigned, isDemo: true, dateLabel: ganttDateLabel(dateStr), staffCount: staff.length };
}
