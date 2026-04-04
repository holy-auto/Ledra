import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Table: insurer_watchlist
 * - id uuid PK default gen_random_uuid()
 * - insurer_id uuid FK → insurers.id
 * - user_id uuid FK → auth.users
 * - target_type text NOT NULL CHECK (certificate|vehicle)
 * - target_id uuid NOT NULL
 * - created_at timestamptz default now()
 * - UNIQUE(user_id, target_type, target_id)
 */

/**
 * GET /api/insurer/watchlist
 * List watchlist items for the current user, enriched with target details.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const admin = createAdminClient();

  try {
    const { data: items, error } = await admin
      .from("insurer_watchlist")
      .select("id, insurer_id, user_id, target_type, target_id, created_at")
      .eq("insurer_id", caller.insurerId)
      .eq("user_id", caller.userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[watchlist] GET error (table may not exist):", error.message);
      return NextResponse.json({ items: [] });
    }

    // Enrich items with target details
    const enriched = await Promise.all(
      (items ?? []).map(async (item) => {
        if (item.target_type === "certificate") {
          const { data: cert } = await admin
            .from("certificates")
            .select("id, public_id, status, updated_at")
            .eq("id", item.target_id)
            .maybeSingle();
          return {
            ...item,
            target_detail: cert
              ? {
                  identifier: cert.public_id,
                  status: cert.status,
                  updated_at: cert.updated_at,
                }
              : null,
          };
        } else if (item.target_type === "vehicle") {
          const { data: vehicle } = await admin
            .from("vehicles")
            .select("id, plate_number, maker, model, updated_at")
            .eq("id", item.target_id)
            .maybeSingle();
          return {
            ...item,
            target_detail: vehicle
              ? {
                  identifier: [vehicle.maker, vehicle.model, vehicle.plate_number]
                    .filter(Boolean)
                    .join(" "),
                  status: null,
                  updated_at: vehicle.updated_at,
                }
              : null,
          };
        }
        return { ...item, target_detail: null };
      }),
    );

    return NextResponse.json({ items: enriched });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/watchlist");
  }
}

/**
 * POST /api/insurer/watchlist
 * Add an item to watchlist.
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

  const { type, target_id } = body as {
    type?: string;
    target_id?: string;
  };

  const validTypes = ["certificate", "vehicle"];
  if (!type || !validTypes.includes(type)) {
    return apiValidationError("type must be 'certificate' or 'vehicle'.");
  }
  if (!target_id) {
    return apiValidationError("target_id is required.");
  }

  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("insurer_watchlist")
      .insert({
        insurer_id: caller.insurerId,
        user_id: caller.userId,
        target_type: type,
        target_id,
      })
      .select("id, insurer_id, user_id, target_type, target_id, created_at")
      .single();

    if (error) {
      // Handle unique constraint violation gracefully
      if (error.code === "23505") {
        return apiValidationError("このアイテムは既にウォッチリストに登録されています。");
      }
      console.error("[watchlist] POST error:", error.message);
      return apiValidationError(error.message);
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/watchlist");
  }
}

/**
 * DELETE /api/insurer/watchlist?id=<uuid>
 * Remove an item from watchlist.
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
      .from("insurer_watchlist")
      .delete()
      .eq("id", id)
      .eq("user_id", caller.userId);

    if (error) {
      console.error("[watchlist] DELETE error:", error.message);
      return apiValidationError(error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiInternalError(err, "DELETE /api/insurer/watchlist");
  }
}
