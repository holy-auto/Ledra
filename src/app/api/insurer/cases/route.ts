import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";

export const runtime = "nodejs";

/**
 * GET /api/insurer/cases
 * List cases for the current insurer with pagination + optional status filter.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const category = url.searchParams.get("category");
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");
  const q = url.searchParams.get("q")?.trim();
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  const admin = createAdminClient();

  try {
    // Build query
    let query = admin
      .from("insurer_cases")
      .select("id, insurer_id, title, description, status, priority, category, case_number, certificate_id, vehicle_id, tenant_id, assigned_to, created_by, resolved_at, closed_at, created_at, updated_at", { count: "exact" })
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (category) {
      query = query.ilike("category", `%${escapeIlike(category)}%`);
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom);
    }

    if (dateTo) {
      // Include the full end day
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endDate.toISOString());
    }

    const certificateId = url.searchParams.get("certificate_id");
    const vehicleId = url.searchParams.get("vehicle_id");
    const tenantId = url.searchParams.get("tenant_id");

    if (certificateId) {
      query = query.eq("certificate_id", certificateId);
    }
    if (vehicleId) {
      query = query.eq("vehicle_id", vehicleId);
    }
    if (tenantId) {
      // Verify insurer has an active contract with this tenant before filtering
      const { data: contract } = await admin
        .from("insurer_contracts")
        .select("id")
        .eq("insurer_id", caller.insurerId)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!contract) {
        return apiValidationError("指定されたテナントとの契約が見つかりません。");
      }
      query = query.eq("tenant_id", tenantId);
    }

    if (q) {
      const safeQ = escapePostgrestValue(escapeIlike(q));
      query = query.or(`title.ilike.%${safeQ}%,case_number.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }

    const { data, error, count } = await query;

    if (error) return apiValidationError(error.message);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return NextResponse.json({ cases: data ?? [], total: count ?? 0 }, { headers });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/cases");
  }
}

/**
 * POST /api/insurer/cases
 * Create a new case.
 */
export async function POST(req: NextRequest) {
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

  const { title, description, certificate_id, vehicle_id, priority, category, tenant_id: bodyTenantId } =
    body as {
      title?: string;
      description?: string;
      certificate_id?: string;
      vehicle_id?: string;
      priority?: string;
      category?: string;
      tenant_id?: string;
    };

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return apiValidationError("title is required.");
  }

  const admin = createAdminClient();

  try {
    // Resolve tenant_id from certificate, vehicle, or direct parameter
    let tenant_id: string | null = bodyTenantId ?? null;
    if (!tenant_id && certificate_id) {
      const { data: cert } = await admin
        .from("certificates")
        .select("tenant_id")
        .eq("id", certificate_id)
        .maybeSingle();
      if (cert) tenant_id = cert.tenant_id;
    }
    if (!tenant_id && vehicle_id) {
      const { data: v } = await admin
        .from("vehicles")
        .select("tenant_id")
        .eq("id", vehicle_id)
        .maybeSingle();
      if (v) tenant_id = v.tenant_id;
    }

    // Verify insurer has a contract with the resolved tenant
    if (tenant_id) {
      const { data: contract } = await admin
        .from("insurer_contracts")
        .select("id")
        .eq("insurer_id", caller.insurerId)
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!contract) {
        return apiValidationError("指定されたテナントとの契約が見つかりません。");
      }
    }

    const insertData: Record<string, unknown> = {
      insurer_id: caller.insurerId,
      title: title.trim(),
      created_by: caller.userId,
    };

    if (description) insertData.description = description;
    if (certificate_id) insertData.certificate_id = certificate_id;
    if (vehicle_id) insertData.vehicle_id = vehicle_id;
    if (tenant_id) insertData.tenant_id = tenant_id;
    if (priority) insertData.priority = priority;
    if (category) insertData.category = category;

    const { data: newCase, error } = await admin
      .from("insurer_cases")
      .insert(insertData)
      .select("id, insurer_id, title, description, certificate_id, vehicle_id, tenant_id, priority, category, created_by, status, case_number, created_at, updated_at")
      .single();

    if (error) return apiValidationError(error.message);

    // Log to insurer_access_logs
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "case_create",
      meta: { case_id: newCase.id, route: "POST /api/insurer/cases" },
      ip,
      user_agent: ua,
    });

    return NextResponse.json({ case: newCase }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/cases");
  }
}
