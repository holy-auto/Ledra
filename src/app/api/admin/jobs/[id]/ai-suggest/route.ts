/**
 * POST /api/admin/jobs/[id]/ai-suggest
 *
 * 案件ワークフロー全体の AI 提案を 1 リクエストで返す:
 *   - title:        飛び込み案件など仮タイトルを実用的なものに置換
 *   - nextAction:   現ステータスに応じた次手 + 文章化
 *   - timerAlert:   想定時間との乖離 + 文章化
 *
 * 各サブ提案は AI 自動入力ポリシー (catalog: `job.*`) に応じて出力を削る。
 * - `job.title` が manual → title を返さない
 * - `job.next_action` が manual → nextAction を返さない
 * - `job.notes` が manual → timerAlert を返さない (UI バナーも非表示)
 *
 * グローバル OFF (`enabled = false`) の場合は 200 で `ai_disabled: true` を返し、
 * UI 側はバナーを出さない。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { generateJobAutoTitle, clipTitle } from "@/lib/ai/jobAutoTitle";
import { generateJobNextAction, type JobStatus } from "@/lib/ai/jobNextAction";
import { generateTimerAlert } from "@/lib/ai/jobTimerAlert";
import { fastModelForPlanTier } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_STATUS: JobStatus[] = ["confirmed", "arrived", "in_progress", "completed", "cancelled"];

function normalizeStatus(s: unknown): JobStatus {
  if (typeof s === "string" && (VALID_STATUS as readonly string[]).includes(s)) return s as JobStatus;
  return "confirmed";
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/admin/jobs/[id]/ai-suggest");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id: reservationId } = await ctx.params;
    if (!reservationId) return apiNotFound("reservation id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_job_assist")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 案件アシストは Standard プラン以上でご利用いただけます。");
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, suggestions: {} });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: reservation, error: rErr } = await admin
      .from("reservations")
      .select(
        "id, status, title, customer_id, vehicle_id, menu_items_json, scheduled_date, start_time, end_time, estimated_amount, updated_at, work_started_at, work_completed_at",
      )
      .eq("id", reservationId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (rErr) return apiInternalError(rErr, "job ai-suggest: reservation");
    if (!reservation) return apiNotFound("reservation not found");

    const status = normalizeStatus(reservation.status);

    // 並列で context を集める。
    const [vehicleRes, customerRes, certsRes, invoicesRes, recentRes] = await Promise.all([
      reservation.vehicle_id
        ? admin.from("vehicles").select("maker, model, year").eq("id", reservation.vehicle_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reservation.customer_id
        ? admin.from("customers").select("name").eq("id", reservation.customer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      reservation.vehicle_id
        ? admin.from("certificates").select("status").eq("vehicle_id", reservation.vehicle_id).eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as Array<{ status: string }>, error: null }),
      reservation.customer_id
        ? admin
            .from("invoices")
            .select("status, due_date")
            .eq("customer_id", reservation.customer_id)
            .eq("tenant_id", tenantId)
        : Promise.resolve({ data: [] as Array<{ status: string; due_date: string | null }>, error: null }),
      admin
        .from("reservations")
        .select("title")
        .eq("tenant_id", tenantId)
        .neq("id", reservationId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const vehicle = vehicleRes.data as { maker?: string; model?: string; year?: number } | null;
    const customerName = (customerRes.data as { name?: string } | null)?.name ?? null;
    const certs = (certsRes.data ?? []) as Array<{ status: string }>;
    const invoices = (invoicesRes.data ?? []) as Array<{ status: string; due_date: string | null }>;
    const recentTitles = ((recentRes.data ?? []) as Array<{ title: string | null }>)
      .map((r) => r.title)
      .filter((t): t is string => !!t);

    const hasActiveCertificate = certs.some((c) => c.status === "active");
    const now = Date.now();
    const hasUnpaidInvoice = invoices.some((i) => i.status === "draft" || i.status === "sent");
    const hasOverdueInvoice = invoices.some(
      (i) => i.status === "sent" && i.due_date && new Date(i.due_date).getTime() < now,
    );

    // メニュー名抽出
    const menuItemNames = extractMenuNames(reservation.menu_items_json);
    const estimatedDurationMin = estimateDurationMinutes(reservation.start_time, reservation.end_time);
    const minutesSinceStatusChange = minutesSince(
      status === "in_progress"
        ? reservation.work_started_at
        : status === "completed"
          ? reservation.work_completed_at
          : reservation.updated_at,
    );

    // ── job.title ──
    const titlePolicy = resolveFieldPolicy(settings, "job.title");
    let titleSuggestion: { title: string; confidence: number; policy: string } | null = null;
    if (titlePolicy !== "manual") {
      const generated = await generateJobAutoTitle(
        {
          vehicle: vehicle ?? undefined,
          customerName,
          menuItemNames,
          recentTitles,
        },
        { model: fastModelForPlanTier(caller.planTier) },
      );
      const fallback = buildFallbackTitle(customerName, vehicle, menuItemNames);
      titleSuggestion = {
        title: generated?.title ?? fallback,
        confidence: generated?.confidence ?? (fallback ? 0.4 : 0),
        policy: titlePolicy,
      };
    }

    // ── job.next_action ──
    const nextActionPolicy = resolveFieldPolicy(settings, "job.next_action");
    const nextAction =
      nextActionPolicy === "manual"
        ? null
        : {
            ...(await generateJobNextAction(
              {
                status,
                hasCustomer: !!reservation.customer_id,
                hasVehicle: !!reservation.vehicle_id,
                hasActiveCertificate,
                hasUnpaidInvoice,
                hasOverdueInvoice,
                minutesSinceStatusChange,
                estimatedDurationMin,
              },
              { model: fastModelForPlanTier(caller.planTier) },
            )),
            policy: nextActionPolicy,
          };

    // ── job.notes (timer alert はノートとして扱う) ──
    const notesPolicy = resolveFieldPolicy(settings, "job.notes");
    let timerAlert: Awaited<ReturnType<typeof generateTimerAlert>> | null = null;
    if (notesPolicy !== "manual" && estimatedDurationMin != null && minutesSinceStatusChange != null) {
      timerAlert = await generateTimerAlert(
        {
          actualMinutes: minutesSinceStatusChange,
          estimatedMinutes: estimatedDurationMin,
          finalized: status === "completed",
        },
        { model: fastModelForPlanTier(caller.planTier) },
      );
    }

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: titleSuggestion?.confidence ?? null,
      meta: {
        title_applied: titlePolicy === "auto",
        next_action_policy: nextActionPolicy,
        timer_severity: timerAlert?.severity ?? null,
      },
    });

    return apiOk({
      ai_disabled: false,
      suggestions: {
        title: titleSuggestion,
        nextAction,
        timerAlert: timerAlert ? { ...timerAlert, policy: notesPolicy } : null,
      },
      context: {
        status,
        hasCustomer: !!reservation.customer_id,
        hasVehicle: !!reservation.vehicle_id,
        estimatedDurationMin,
        minutesSinceStatusChange,
      },
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "job ai-suggest");
  }
}

function extractMenuNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "name" in item) {
      const name = (item as { name?: unknown }).name;
      if (typeof name === "string" && name.trim()) out.push(name.trim());
    }
  }
  return out.slice(0, 10);
}

function estimateDurationMinutes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  // start_time / end_time are TIME without date.
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  if (startMin == null || endMin == null) return null;
  const diff = endMin - startMin;
  return diff > 0 ? diff : null;
}

function timeToMinutes(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

function minutesSince(ts: string | null): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((Date.now() - ms) / 60_000);
}

function buildFallbackTitle(
  customerName: string | null,
  vehicle: { maker?: string; model?: string; year?: number } | null,
  menuItemNames: string[],
): string {
  const parts: string[] = [];
  if (customerName) {
    // 姓だけ
    const surname = customerName.split(/\s+/)[0];
    if (surname) parts.push(`${surname}様`);
  }
  if (vehicle?.maker || vehicle?.model) {
    parts.push([vehicle?.maker, vehicle?.model].filter(Boolean).join(" "));
  }
  if (menuItemNames.length > 0) parts.push(menuItemNames[0]);
  return clipTitle(parts.join(" ") || "案件");
}
