/**
 * 管理ダッシュボード「今日のタスク」の純関数。
 *
 * テナント全体の reservations / invoices / certificates から、施工店スタッフが
 * 「今、何をすべきか」を 4 タイル前後に絞って返す。LLM は使わない — 数値判定
 * だけで決定的に「今日の優先タスク」を導く。
 *
 * deriveSignals (顧客 360°) のテナント版。同じ設計思想で、UI / cron / API から
 * 共通利用できるよう純関数として切り出している。
 */

export interface TodayReservation {
  id: string;
  status: string | null; // confirmed/arrived/in_progress/completed/cancelled
  scheduled_date: string; // YYYY-MM-DD
  title?: string | null;
}

export interface TodayInvoice {
  id: string;
  status: string | null; // draft/sent/accepted/paid/overdue/rejected/cancelled
  total: number | null;
  due_date: string | null;
}

export interface TodayCertificate {
  id: string;
  status: string | null; // active/void/draft/expired
  expiry_date: string | null;
}

export type TaskTone = "urgent" | "warn" | "normal";

export interface TaskTile {
  /** 安定 ID (e2e / ログ / アイコン分岐で使う) */
  id:
    | "in_progress_jobs"
    | "today_visits"
    | "overdue_invoices"
    | "expiring_certificates"
    | "unpaid_invoices"
    | "churn_risk_customers";
  label: string;
  count: number;
  /** カードのサブタイトル (件数の意味を補足) */
  hint: string;
  /** クリック時の遷移先 */
  href: string;
  tone: TaskTone;
  /** 優先度ソート用 (low の数値ほど上に出る) */
  priority: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDayStr(d: Date): string {
  // `toISOString()` は UTC に変換するため、日本時間の午前中などで前日になる。
  // ダッシュボードの「今日」は利用者のローカル日付として組み立てる。
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isUnpaidStatus(status: string | null): boolean {
  return status === "sent" || status === "overdue";
}

function isOverdueInvoice(inv: TodayInvoice, now: Date): boolean {
  if (inv.status === "overdue") return true;
  if (inv.status !== "sent" || !inv.due_date) return false;
  const due = Date.parse(inv.due_date);
  if (Number.isNaN(due)) return false;
  return due < now.getTime();
}

export function deriveTodayTasks(input: {
  reservations: TodayReservation[];
  invoices: TodayInvoice[];
  certificates: TodayCertificate[];
  /** 180 日以上来店がなく予約もない顧客数 (DB 集計値をそのまま渡す) */
  churnRiskCustomerCount?: number;
  now?: Date;
  /** 何日先までの保証切れを「間近」とみなすか (default 30) */
  expiringWindowDays?: number;
}): TaskTile[] {
  const now = input.now ?? new Date();
  const today = startOfDayStr(now);
  const expiringWindowDays = input.expiringWindowDays ?? 30;
  const tiles: TaskTile[] = [];

  // 1. 作業中の案件 (テナント全体)
  const inProgressCount = input.reservations.filter((r) => r.status === "in_progress").length;
  if (inProgressCount > 0) {
    tiles.push({
      id: "in_progress_jobs",
      label: "作業中の案件",
      count: inProgressCount,
      hint: "進捗を更新するか、完了に進めてください",
      href: "/admin/reservations",
      tone: "urgent",
      priority: 0,
    });
  }

  // 2. 本日の来店 (cancelled / completed 以外で今日)
  const todayVisits = input.reservations.filter(
    (r) =>
      r.scheduled_date === today && r.status !== "cancelled" && r.status !== "completed" && r.status !== "in_progress",
  ).length;
  if (todayVisits > 0) {
    tiles.push({
      id: "today_visits",
      label: "本日の来店予約",
      count: todayVisits,
      hint: "チェックイン・受付の準備をしましょう",
      href: "/admin/reservations",
      tone: "normal",
      priority: 1,
    });
  }

  // 3. 期限超過の請求
  let overdueCount = 0;
  let overdueTotal = 0;
  for (const inv of input.invoices) {
    if (isOverdueInvoice(inv, now)) {
      overdueCount += 1;
      overdueTotal += inv.total ?? 0;
    }
  }
  if (overdueCount > 0) {
    tiles.push({
      id: "overdue_invoices",
      label: "期限超過の請求",
      count: overdueCount,
      hint: `合計 ¥${overdueTotal.toLocaleString("ja-JP")} が未回収です`,
      href: "/admin/invoices",
      tone: "urgent",
      priority: 0,
    });
  } else {
    // 期限超過は無いが未払いは残ってる場合だけ別タイルで控えめに出す
    let unpaid = 0;
    let unpaidTotal = 0;
    for (const inv of input.invoices) {
      if (!isUnpaidStatus(inv.status)) continue;
      unpaid += 1;
      unpaidTotal += inv.total ?? 0;
    }
    if (unpaid > 0) {
      tiles.push({
        id: "unpaid_invoices",
        label: "未払の請求",
        count: unpaid,
        hint: `合計 ¥${unpaidTotal.toLocaleString("ja-JP")} がまだ入金されていません`,
        href: "/admin/invoices",
        tone: "warn",
        priority: 2,
      });
    }
  }

  // 4. 保証切れ間近の証明書 (active 限定 / 今日〜N日)
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const cutoffMs = todayMs + expiringWindowDays * MS_PER_DAY;
  let expiringSoon = 0;
  for (const cert of input.certificates) {
    if (cert.status !== "active" || !cert.expiry_date) continue;
    const expiry = Date.parse(cert.expiry_date);
    if (Number.isNaN(expiry)) continue;
    if (expiry >= todayMs && expiry <= cutoffMs) expiringSoon += 1;
  }
  if (expiringSoon > 0) {
    tiles.push({
      id: "expiring_certificates",
      label: `${expiringWindowDays} 日以内に保証切れ`,
      count: expiringSoon,
      hint: "メンテナンス案内 / 再施工提案のチャンス",
      href: "/admin/certificates",
      tone: "warn",
      priority: 2,
    });
  }

  // 5. 離反リスク顧客 (180 日以上来店なし + 予約なし)
  const churnCount = input.churnRiskCustomerCount ?? 0;
  if (churnCount > 0) {
    tiles.push({
      id: "churn_risk_customers",
      label: "離反リスクの顧客",
      count: churnCount,
      hint: "180 日以上来店がなく予約もありません。再来店を促しましょう。",
      href: "/admin/customers",
      tone: "warn",
      priority: 3,
    });
  }

  // priority 昇順 → count 降順 の安定ソート
  tiles.sort((a, b) => a.priority - b.priority || b.count - a.count);

  return tiles;
}
