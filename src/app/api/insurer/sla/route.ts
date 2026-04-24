import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Table: insurer_sla_config
 * - id uuid PK default gen_random_uuid()
 * - insurer_id uuid FK → insurers.id UNIQUE
 * - urgent_hours integer default 4
 * - high_hours integer default 24
 * - normal_hours integer default 72
 * - low_hours integer default 168 (1 week)
 * - updated_at timestamptz default now()
 */

/** Default SLA thresholds (hours) */
const DEFAULT_SLA = {
  urgent: 4,
  high: 24,
  normal: 72,
  low: 168, // 1 week
};

type SlaConfig = {
  urgent: number;
  high: number;
  normal: number;
  low: number;
};

/**
 * GET /api/insurer/sla
 * Return SLA config + cases at risk / overdue.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // 1. Load SLA config (gracefully handle missing table)
    let config: SlaConfig = { ...DEFAULT_SLA };
    try {
      const { data: slaRow } = await admin
        .from("insurer_sla_config")
        .select("id, insurer_id, urgent_hours, high_hours, normal_hours, low_hours, updated_at")
        .eq("insurer_id", caller.insurerId)
        .maybeSingle();

      if (slaRow) {
        config = {
          urgent: slaRow.urgent_hours ?? DEFAULT_SLA.urgent,
          high: slaRow.high_hours ?? DEFAULT_SLA.high,
          normal: slaRow.normal_hours ?? DEFAULT_SLA.normal,
          low: slaRow.low_hours ?? DEFAULT_SLA.low,
        };
      }
    } catch {
      // Table may not exist — use defaults
      console.warn("[sla] Config table may not exist, using defaults.");
    }

    // 2. Fetch open/in_progress cases
    const { data: cases, error: casesErr } = await admin
      .from("insurer_cases")
      .select("id, case_number, title, status, priority, created_at, assigned_to")
      .eq("insurer_id", caller.insurerId)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: true });

    if (casesErr) {
      console.error("[sla] Cases query error:", casesErr.message);
      return apiJson({ config, at_risk: [], overdue: [] });
    }

    // 3. Classify cases
    const now = Date.now();
    const at_risk: typeof cases = [];
    const overdue: typeof cases = [];

    for (const c of cases ?? []) {
      const priority = c.priority as keyof SlaConfig;
      const thresholdHours = config[priority] ?? config.normal;
      const createdMs = new Date(c.created_at).getTime();
      const elapsedHours = (now - createdMs) / (1000 * 60 * 60);
      const remainingHours = thresholdHours - elapsedHours;

      const enriched = {
        ...c,
        sla_threshold_hours: thresholdHours,
        elapsed_hours: Math.round(elapsedHours * 10) / 10,
        remaining_hours: Math.round(remainingHours * 10) / 10,
      };

      if (remainingHours <= 0) {
        overdue.push(enriched);
      } else if (remainingHours <= thresholdHours * 0.25) {
        // At risk = within 25% of deadline
        at_risk.push(enriched);
      }
    }

    return apiJson({ config, at_risk, overdue });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/sla");
  }
}

/**
 * PATCH /api/insurer/sla
 * Update SLA config.
 */
export async function PATCH(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("Invalid JSON body.");
  }

  const { urgent, high, normal, low } = body as {
    urgent?: number;
    high?: number;
    normal?: number;
    low?: number;
  };

  // Validate: all must be positive numbers
  const updates: Record<string, number> = {};
  if (urgent !== undefined) {
    if (typeof urgent !== "number" || urgent <= 0) return apiValidationError("urgent must be a positive number.");
    updates.urgent_hours = urgent;
  }
  if (high !== undefined) {
    if (typeof high !== "number" || high <= 0) return apiValidationError("high must be a positive number.");
    updates.high_hours = high;
  }
  if (normal !== undefined) {
    if (typeof normal !== "number" || normal <= 0) return apiValidationError("normal must be a positive number.");
    updates.normal_hours = normal;
  }
  if (low !== undefined) {
    if (typeof low !== "number" || low <= 0) return apiValidationError("low must be a positive number.");
    updates.low_hours = low;
  }

  if (Object.keys(updates).length === 0) {
    return apiValidationError("At least one SLA value must be provided.");
  }

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    // Upsert: try update first, then insert if not found
    const { data: existing } = await admin
      .from("insurer_sla_config")
      .select("id")
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("insurer_sla_config")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("insurer_id", caller.insurerId);

      if (error) {
        console.error("[sla] PATCH update error:", error.message);
        return apiInternalError(error, "insurer.sla");
      }
    } else {
      const insertData = {
        insurer_id: caller.insurerId,
        urgent_hours: urgent ?? DEFAULT_SLA.urgent,
        high_hours: high ?? DEFAULT_SLA.high,
        normal_hours: normal ?? DEFAULT_SLA.normal,
        low_hours: low ?? DEFAULT_SLA.low,
      };
      const { error } = await admin.from("insurer_sla_config").insert(insertData);

      if (error) {
        console.error("[sla] PATCH insert error:", error.message);
        return apiInternalError(error, "insurer.sla");
      }
    }

    return apiJson({ ok: true });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/sla");
  }
}
