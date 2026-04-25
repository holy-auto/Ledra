import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { insurerSavedSearchCreateSchema } from "@/lib/validations/insurer";

export const dynamic = "force-dynamic";

/**
 * GET /api/insurer/saved-searches
 *
 * Returns saved searches for the current insurer.
 */
export async function GET(_req: NextRequest) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("insurer_saved_searches")
      .select("id, name, query, status_filter, date_from, date_to, created_at")
      .eq("insurer_id", caller.insurerId)
      .order("created_at", { ascending: false });

    if (error) {
      return apiInternalError(error, "insurer-saved-searches GET");
    }

    return apiJson({ saved_searches: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "insurer-saved-searches GET");
  }
}

/**
 * POST /api/insurer/saved-searches
 *
 * Save a new search.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const parsed = insurerSavedSearchCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const row = {
      insurer_id: caller.insurerId,
      ...parsed.data,
    };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("insurer_saved_searches")
      .insert(row)
      .select("id, insurer_id, name, query, status_filter, date_from, date_to, created_at")
      .single();

    if (error) {
      return apiInternalError(error, "insurer-saved-searches POST");
    }

    return apiJson({ ok: true, saved_search: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "insurer-saved-searches POST");
  }
}

/**
 * DELETE /api/insurer/saved-searches?id=UUID
 *
 * Remove a saved search by ID.
 */
export async function DELETE(req: NextRequest) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const searchId = new URL(req.url).searchParams.get("id") ?? "";
    if (!searchId) {
      return apiValidationError("id query parameter is required");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("insurer_saved_searches")
      .delete()
      .eq("id", searchId)
      .eq("insurer_id", caller.insurerId);

    if (error) {
      return apiInternalError(error, "insurer-saved-searches DELETE");
    }

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "insurer-saved-searches DELETE");
  }
}
