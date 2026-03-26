import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

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
      .select("*", { count: "exact" })
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
      query = query.ilike("category", `%${category}%`);
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

    if (q) {
      query = query.or(`title.ilike.%${q}%,case_number.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data, error, count } = await query;

    if (error) return apiValidationError(error.message);

    return NextResponse.json({ cases: data ?? [], total: count ?? 0 });
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

  const { title, description, certificate_id, vehicle_id, priority, category } =
    body as {
      title?: string;
      description?: string;
      certificate_id?: string;
      vehicle_id?: string;
      priority?: string;
      category?: string;
    };

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return apiValidationError("title is required.");
  }

  const admin = createAdminClient();

  try {
    // If certificate_id is provided, look up tenant_id
    let tenant_id: string | null = null;
    if (certificate_id) {
      const { data: cert } = await admin
        .from("certificates")
        .select("tenant_id")
        .eq("id", certificate_id)
        .maybeSingle();
      if (cert) {
        tenant_id = cert.tenant_id;
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
      .select("*")
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
