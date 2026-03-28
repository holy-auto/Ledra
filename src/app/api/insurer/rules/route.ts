import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Table: insurer_assignment_rules
 * - id uuid PK default gen_random_uuid()
 * - insurer_id uuid FK → insurers.id
 * - name text NOT NULL
 * - condition_type text NOT NULL CHECK (category|tenant|priority)
 * - condition_value text NOT NULL
 * - assign_to uuid FK → insurer_users.id
 * - is_active boolean default true
 * - created_at timestamptz default now()
 */

/**
 * GET /api/insurer/rules
 * List auto-assignment rules for the current insurer.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("insurer_assignment_rules")
      .select("*")
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[rules] GET error (table may not exist):", error.message);
      return NextResponse.json({ rules: [] });
    }

    // Also fetch insurer_users for the assign_to dropdown
    const { data: users } = await admin
      .from("insurer_users")
      .select("id, display_name, role, is_active")
      .eq("insurer_id", caller.insurerId)
      .eq("is_active", true)
      .order("display_name");

    return NextResponse.json({ rules: data ?? [], users: users ?? [] });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/rules");
  }
}

/**
 * POST /api/insurer/rules
 * Create a new auto-assignment rule.
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

  const { name, condition_type, condition_value, assign_to, is_active } = body as {
    name?: string;
    condition_type?: string;
    condition_value?: string;
    assign_to?: string;
    is_active?: boolean;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return apiValidationError("name is required.");
  }

  const validTypes = ["category", "tenant", "priority"];
  if (!condition_type || !validTypes.includes(condition_type)) {
    return apiValidationError("condition_type must be one of: category, tenant, priority.");
  }

  if (!condition_value || typeof condition_value !== "string" || condition_value.trim().length === 0) {
    return apiValidationError("condition_value is required.");
  }

  if (!assign_to) {
    return apiValidationError("assign_to is required.");
  }

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("insurer_assignment_rules")
      .insert({
        insurer_id: caller.insurerId,
        name: name.trim(),
        condition_type,
        condition_value: condition_value.trim(),
        assign_to,
        is_active: is_active !== false,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[rules] POST error:", error.message);
      return apiValidationError(error.message);
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/rules");
  }
}

/**
 * PATCH /api/insurer/rules
 * Update an existing rule (toggle is_active, or edit fields).
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

  const { id, ...updates } = body as {
    id?: string;
    name?: string;
    condition_type?: string;
    condition_value?: string;
    assign_to?: string;
    is_active?: boolean;
  };

  if (!id) return apiValidationError("id is required.");

  const admin = createAdminClient();

  try {
    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.condition_type !== undefined) updateData.condition_type = updates.condition_type;
    if (updates.condition_value !== undefined) updateData.condition_value = updates.condition_value;
    if (updates.assign_to !== undefined) updateData.assign_to = updates.assign_to;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

    const { data, error } = await admin
      .from("insurer_assignment_rules")
      .update(updateData)
      .eq("id", id)
      .eq("insurer_id", caller.insurerId)
      .select("*")
      .single();

    if (error) {
      console.error("[rules] PATCH error:", error.message);
      return apiValidationError(error.message);
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/rules");
  }
}

/**
 * DELETE /api/insurer/rules?id=<uuid>
 * Delete a rule by id.
 */
export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return apiValidationError("id query parameter is required.");

  const admin = createAdminClient();

  try {
    const { error } = await admin
      .from("insurer_assignment_rules")
      .delete()
      .eq("id", id)
      .eq("insurer_id", caller.insurerId);

    if (error) {
      console.error("[rules] DELETE error:", error.message);
      return apiValidationError(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiInternalError(err, "DELETE /api/insurer/rules");
  }
}
