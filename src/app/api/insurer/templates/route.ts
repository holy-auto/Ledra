import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Table: insurer_case_templates
 * - id uuid PK default gen_random_uuid()
 * - insurer_id uuid FK → insurers.id
 * - name text NOT NULL
 * - title_template text NOT NULL
 * - category text
 * - default_priority text CHECK (low|normal|high|urgent) default 'normal'
 * - description_template text
 * - created_by uuid FK → auth.users
 * - created_at timestamptz default now()
 */

/**
 * GET /api/insurer/templates
 * List custom case templates for the current insurer.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin
      .from("insurer_case_templates")
      .select(
        "id, insurer_id, name, title_template, category, default_priority, description_template, created_by, created_at",
      )
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false });

    if (error) {
      // Table may not exist yet — return empty array gracefully
      console.warn("[templates] GET error (table may not exist):", error.message);
      return apiJson({ templates: [] });
    }

    return apiJson({ templates: data ?? [] });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/templates");
  }
}

/**
 * POST /api/insurer/templates
 * Create a new custom case template.
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

  const { name, title_template, category, default_priority, description_template } = body as {
    name?: string;
    title_template?: string;
    category?: string;
    default_priority?: string;
    description_template?: string;
  };

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return apiValidationError("name is required.");
  }
  if (!title_template || typeof title_template !== "string" || title_template.trim().length === 0) {
    return apiValidationError("title_template is required.");
  }

  const validPriorities = ["low", "normal", "high", "urgent"];
  const priority = validPriorities.includes(default_priority ?? "") ? default_priority : "normal";

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin
      .from("insurer_case_templates")
      .insert({
        insurer_id: caller.insurerId,
        name: name.trim(),
        title_template: title_template.trim(),
        category: category?.trim() ?? null,
        default_priority: priority,
        description_template: description_template?.trim() ?? null,
        created_by: caller.userId,
      })
      .select(
        "id, insurer_id, name, title_template, category, default_priority, description_template, created_by, created_at",
      )
      .single();

    if (error) {
      console.error("[templates] POST error:", error.message);
      return apiInternalError(error, "insurer.templates");
    }

    return apiJson({ template: data }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/templates");
  }
}

/**
 * DELETE /api/insurer/templates?id=<uuid>
 * Delete a template by id.
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
      .from("insurer_case_templates")
      .delete()
      .eq("id", id)
      .eq("insurer_id", caller.insurerId);

    if (error) {
      console.error("[templates] DELETE error:", error.message);
      return apiInternalError(error, "insurer.templates");
    }

    return apiJson({ ok: true });
  } catch (err) {
    return apiInternalError(err, "DELETE /api/insurer/templates");
  }
}
