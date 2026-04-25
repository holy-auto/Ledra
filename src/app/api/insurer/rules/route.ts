import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { insurerRuleCreateSchema, insurerRuleUpdateSchema } from "@/lib/validations/insurer";

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

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin
      .from("insurer_assignment_rules")
      .select("id, insurer_id, name, condition_type, condition_value, assign_to, is_active, created_at")
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[rules] GET error (table may not exist):", error.message);
      return apiJson({ rules: [] });
    }

    // Also fetch insurer_users for the assign_to dropdown
    const { data: users } = await admin
      .from("insurer_users")
      .select("id, display_name, role, is_active")
      .eq("insurer_id", caller.insurerId)
      .eq("is_active", true)
      .order("display_name");

    return apiJson({ rules: data ?? [], users: users ?? [] });
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

  const parsed = insurerRuleCreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { name, condition_type, condition_value, assign_to, is_active } = parsed.data;

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin
      .from("insurer_assignment_rules")
      .insert({
        insurer_id: caller.insurerId,
        name,
        condition_type,
        condition_value,
        assign_to,
        is_active: is_active !== false,
      })
      .select("id, insurer_id, name, condition_type, condition_value, assign_to, is_active, created_at")
      .single();

    if (error) {
      console.error("[rules] POST error:", error.message);
      return apiInternalError(error, "insurer.rules");
    }

    return apiJson({ rule: data }, { status: 201 });
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

  const parsed = insurerRuleUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { id, ...updates } = parsed.data;

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) updateData[k] = v;
    }

    const { data, error } = await admin
      .from("insurer_assignment_rules")
      .update(updateData)
      .eq("id", id)
      .eq("insurer_id", caller.insurerId)
      .select("id, insurer_id, name, condition_type, condition_value, assign_to, is_active, created_at")
      .single();

    if (error) {
      console.error("[rules] PATCH error:", error.message);
      return apiInternalError(error, "insurer.rules");
    }

    return apiJson({ rule: data });
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

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { error } = await admin
      .from("insurer_assignment_rules")
      .delete()
      .eq("id", id)
      .eq("insurer_id", caller.insurerId);

    if (error) {
      console.error("[rules] DELETE error:", error.message);
      return apiInternalError(error, "insurer.rules");
    }

    return apiJson({ ok: true });
  } catch (err) {
    return apiInternalError(err, "DELETE /api/insurer/rules");
  }
}
