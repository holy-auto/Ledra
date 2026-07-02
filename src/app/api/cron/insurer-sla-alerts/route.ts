import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { recordCronSuccess, recordCronFailure } from "@/lib/cron/failureTracker";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Insurer SLA alert cron — hourly (`20 * * * *`)。
 *
 * これまで `insurer_sla_config` は GET /api/insurer/sla の「その場計算・受動的表示」
 * にしか使われておらず、担当者が能動的にポータルを開かない限り期限超過に気づけなかった。
 * この cron は全保険会社の未クローズ案件を走査し、優先度ベースの期限に対して
 * at_risk (残り <= 25%) / overdue (残り <= 0) を検出し、担当者 (+ overdue は管理者)
 * に in-app 通知 (insurer_notifications) を送る。
 *
 * SLA しきい値・at_risk/overdue の判定ロジックは GET /api/insurer/sla と一致させている。
 *
 * 冪等性 / 二重通知防止:
 *   - cron_locks (withCronLock) で並列起動を防止
 *   - 各案件の insurer_cases.meta.sla_alert_stage をマーカーとして使い、
 *     「1 案件につき at_risk 1 回 / overdue 1 回」に制限する。
 *     エスカレーション (null→at_risk→overdue) は許可するが、逆行や再送はしない。
 *
 * 通知先:
 *   - at_risk: 担当者 (assigned_to)。未アサインなら管理者にフォールバック。
 *   - overdue: 担当者 + 保険会社管理者 (role='admin')。
 *
 * メール: SLA 専用のメールテンプレートは既存に無いため、ここでは in-app 通知のみ。
 *         (タスク方針: メール配管が複雑なら in-app 通知のみで可)
 */

/** Default SLA thresholds (hours) — GET /api/insurer/sla の DEFAULT_SLA と一致 */
const DEFAULT_SLA = {
  urgent: 4,
  high: 24,
  normal: 72,
  low: 168, // 1 week
} as const;

type SlaConfig = { urgent: number; high: number; normal: number; low: number };

/** 未クローズ (SLA クロックが進行中) とみなすステータス。resolved / closed は除外。 */
const OPEN_STATUSES = ["open", "in_progress", "pending_tenant"] as const;

type SlaStage = "at_risk" | "overdue";

/**
 * 案件の SLA ステージを判定する純粋関数。
 * GET /api/insurer/sla の分類ロジック (remaining <= 0 → overdue,
 * remaining <= threshold*0.25 → at_risk) と一致させている。
 */
function classifySlaStage(
  createdAtMs: number,
  priority: string,
  config: SlaConfig,
  nowMs: number,
): { stage: SlaStage | null; thresholdHours: number; remainingHours: number } {
  const thresholdHours = config[priority as keyof SlaConfig] ?? config.normal;
  const elapsedHours = (nowMs - createdAtMs) / (1000 * 60 * 60);
  const remainingHours = thresholdHours - elapsedHours;

  let stage: SlaStage | null = null;
  if (remainingHours <= 0) {
    stage = "overdue";
  } else if (remainingHours <= thresholdHours * 0.25) {
    stage = "at_risk";
  }
  return { stage, thresholdHours, remainingHours };
}

/**
 * dedup: 直前に送ったステージ (meta.sla_alert_stage) を踏まえ、今回通知すべきか。
 * - null → at_risk / overdue: 通知する
 * - at_risk → overdue: 通知する (エスカレーション)
 * - at_risk → at_risk / overdue → overdue / overdue → at_risk: 通知しない
 */
function shouldNotify(stage: SlaStage, prevStage: string | undefined | null): boolean {
  if (stage === "overdue") return prevStage !== "overdue";
  // stage === "at_risk"
  return prevStage !== "at_risk" && prevStage !== "overdue";
}

type SupabaseAdmin = ReturnType<typeof createServiceRoleAdmin>;

interface CaseRow {
  id: string;
  insurer_id: string;
  case_number: string | null;
  title: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function notificationCopy(
  stage: SlaStage,
  caseNumber: string,
  title: string,
  remainingHours: number,
): { title: string; body: string } {
  const label = caseNumber ? `案件 ${caseNumber}` : "案件";
  const t = title ? `「${title}」` : "";
  if (stage === "overdue") {
    const over = Math.max(0, Math.round(-remainingHours));
    return {
      title: "SLA期限を超過しました",
      body: `${label}${t}がSLA対応期限を超過しました（約${over}時間超過）。至急ご対応ください。`,
    };
  }
  const remain = Math.max(0, Math.round(remainingHours));
  return {
    title: "SLA期限が近づいています",
    body: `${label}${t}の対応期限が近づいています（残り約${remain}時間）。`,
  };
}

async function runSlaAlerts(supabase: SupabaseAdmin) {
  const nowMs = Date.now();
  let casesScanned = 0;
  let atRiskNotified = 0;
  let overdueNotified = 0;
  let notificationsInserted = 0;

  // 1. 全保険会社の未クローズ案件を一括取得 (service role で横断)。
  const { data: rawCases, error: casesErr } = await supabase
    .from("insurer_cases")
    .select("id, insurer_id, case_number, title, status, priority, assigned_to, created_at, meta")
    .in("status", OPEN_STATUSES as unknown as string[])
    .order("created_at", { ascending: true });

  if (casesErr) {
    throw new Error(`insurer_cases query failed: ${casesErr.message}`);
  }
  const cases = (rawCases ?? []) as CaseRow[];
  casesScanned = cases.length;
  if (cases.length === 0) {
    return { cases_scanned: 0, at_risk_notified: 0, overdue_notified: 0, notifications_inserted: 0 };
  }

  const insurerIds = [...new Set(cases.map((c) => c.insurer_id))];

  // 2. 関係する保険会社の SLA 設定を一括取得しマップ化 (未設定は DEFAULT_SLA)。
  const configMap = new Map<string, SlaConfig>();
  try {
    const { data: slaRows } = await supabase
      .from("insurer_sla_config")
      .select("insurer_id, urgent_hours, high_hours, normal_hours, low_hours")
      .in("insurer_id", insurerIds);
    for (const row of slaRows ?? []) {
      configMap.set(row.insurer_id as string, {
        urgent: (row.urgent_hours as number | null) ?? DEFAULT_SLA.urgent,
        high: (row.high_hours as number | null) ?? DEFAULT_SLA.high,
        normal: (row.normal_hours as number | null) ?? DEFAULT_SLA.normal,
        low: (row.low_hours as number | null) ?? DEFAULT_SLA.low,
      });
    }
  } catch {
    // insurer_sla_config テーブル欠損時などは全社デフォルトで継続。
    logger.warn("[cron/insurer-sla-alerts] sla config load failed, using defaults");
  }

  // 3. assigned_to (insurer_users.id) → user_id (auth.users) のマップ。
  const assignedInsurerUserIds = [...new Set(cases.map((c) => c.assigned_to).filter((v): v is string => !!v))];
  const assigneeUserIdById = new Map<string, string>();
  if (assignedInsurerUserIds.length > 0) {
    const { data: assignees } = await supabase
      .from("insurer_users")
      .select("id, user_id")
      .in("id", assignedInsurerUserIds);
    for (const u of assignees ?? []) {
      if (u.user_id) assigneeUserIdById.set(u.id as string, u.user_id as string);
    }
  }

  // 4. 各保険会社の管理者 (role='admin', is_active) の user_id 一覧。
  const adminUserIdsByInsurer = new Map<string, string[]>();
  {
    const { data: admins } = await supabase
      .from("insurer_users")
      .select("insurer_id, user_id, role, is_active")
      .in("insurer_id", insurerIds)
      .eq("role", "admin")
      .eq("is_active", true);
    for (const a of admins ?? []) {
      if (!a.user_id) continue;
      const list = adminUserIdsByInsurer.get(a.insurer_id as string) ?? [];
      list.push(a.user_id as string);
      adminUserIdsByInsurer.set(a.insurer_id as string, list);
    }
  }

  // 5. 案件ごとに分類 → dedup → 通知 + meta マーカー更新。
  for (const c of cases) {
    const config = configMap.get(c.insurer_id) ?? { ...DEFAULT_SLA };
    const { stage, remainingHours } = classifySlaStage(new Date(c.created_at).getTime(), c.priority, config, nowMs);
    if (!stage) continue;

    const meta = asRecord(c.meta);
    const prevStage = typeof meta.sla_alert_stage === "string" ? meta.sla_alert_stage : null;
    if (!shouldNotify(stage, prevStage)) continue;

    // 受信者の解決。
    const recipients = new Set<string>();
    const assignedUserId = c.assigned_to ? assigneeUserIdById.get(c.assigned_to) : undefined;
    if (assignedUserId) recipients.add(assignedUserId);

    const admins = adminUserIdsByInsurer.get(c.insurer_id) ?? [];
    if (stage === "overdue") {
      // overdue は担当者に加え管理者にも通知。
      for (const a of admins) recipients.add(a);
    } else if (recipients.size === 0) {
      // at_risk で未アサインの場合は管理者にフォールバック (通知の取りこぼし防止)。
      for (const a of admins) recipients.add(a);
    }

    if (recipients.size === 0) {
      // 通知先が全く居ない場合はマーカーを進めず、次回 (管理者登録後等) に再試行させる。
      logger.warn("[cron/insurer-sla-alerts] no recipient for case, skipping", {
        caseId: c.id,
        insurerId: c.insurer_id,
        stage,
      });
      continue;
    }

    const copy = notificationCopy(stage, c.case_number ?? "", c.title ?? "", remainingHours);
    const rows = [...recipients].map((userId) => ({
      insurer_id: c.insurer_id,
      user_id: userId,
      type: stage === "overdue" ? "sla_overdue" : "sla_at_risk",
      title: copy.title,
      body: copy.body,
      link: `/insurer/cases/${c.id}`,
    }));

    const { error: notifErr } = await supabase.from("insurer_notifications").insert(rows);
    if (notifErr) {
      logger.warn("[cron/insurer-sla-alerts] notification insert failed", {
        caseId: c.id,
        error: notifErr.message,
      });
      // 通知に失敗したらマーカーを進めない (次回再送)。
      continue;
    }
    notificationsInserted += rows.length;
    if (stage === "overdue") overdueNotified += 1;
    else atRiskNotified += 1;

    // dedup マーカーを更新 (既存 meta を保持してマージ)。
    const { error: metaErr } = await supabase
      .from("insurer_cases")
      .update({
        meta: {
          ...meta,
          sla_alert_stage: stage,
          sla_alert_at: new Date(nowMs).toISOString(),
        },
      })
      .eq("id", c.id);
    if (metaErr) {
      logger.warn("[cron/insurer-sla-alerts] meta marker update failed", {
        caseId: c.id,
        error: metaErr.message,
      });
    }
  }

  return {
    cases_scanned: casesScanned,
    at_risk_notified: atRiskNotified,
    overdue_notified: overdueNotified,
    notifications_inserted: notificationsInserted,
  };
}

export async function GET(req: NextRequest) {
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authError);

  const supabase = createServiceRoleAdmin(
    "cron:insurer-sla-alerts — scans open insurer_cases across every insurer for SLA breaches",
  );

  try {
    const lock = await withCronLock(supabase, "insurer-sla-alerts", 600, () => runSlaAlerts(supabase));

    if (!lock.acquired) {
      return apiOk({ skipped: "lock-held" });
    }

    await recordCronSuccess(supabase, "insurer-sla-alerts");
    return apiOk({ ...lock.value });
  } catch (e) {
    await recordCronFailure(supabase, "insurer-sla-alerts", e);
    await sendCronFailureAlert("insurer-sla-alerts", e);
    return apiInternalError(e, "insurer-sla-alerts cron");
  }
}

export const __testing = { classifySlaStage, shouldNotify, notificationCopy, DEFAULT_SLA, OPEN_STATUSES };
