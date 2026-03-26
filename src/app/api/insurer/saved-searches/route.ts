import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import {
  apiUnauthorized,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

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

    return NextResponse.json({ saved_searches: data ?? [] });
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

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const name = (typeof body?.name === "string" ? body.name : "").trim();
    if (!name) {
      return apiValidationError("name is required");
    }

    const row = {
      insurer_id: caller.insurerId,
      name,
      query: (typeof body?.query === "string" ? body.query : null) || null,
      status_filter: (typeof body?.status_filter === "string" ? body.status_filter : null) || null,
      date_from: (typeof body?.date_from === "string" ? body.date_from : null) || null,
      date_to: (typeof body?.date_to === "string" ? body.date_to : null) || null,
    };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("insurer_saved_searches")
      .insert(row)
      .select()
      .single();

    if (error) {
      return apiInternalError(error, "insurer-saved-searches POST");
    }

    return NextResponse.json({ ok: true, saved_search: data }, { status: 201 });
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

    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "insurer-saved-searches DELETE");
  }
}
