import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * insurer_notifications table structure:
 * - id uuid PK default gen_random_uuid()
 * - insurer_id uuid FK references insurers(id)
 * - user_id uuid FK references auth.users(id) (nullable, null = all users of insurer)
 * - type text CHECK (type IN ('case_update', 'pii_approved', 'pii_rejected', 'new_message', 'system'))
 * - title text NOT NULL
 * - body text
 * - link text (e.g. /insurer/cases/xxx)
 * - is_read boolean default false
 * - created_at timestamptz default now()
 */

/**
 * GET /api/insurer/notifications
 * Fetch notifications for the current insurer user, ordered by created_at desc.
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    const { data, error } = await admin
      .from("insurer_notifications")
      .select("id, insurer_id, user_id, type, title, body, link, is_read, created_at")
      .eq("insurer_id", caller.insurerId)
      .or(`user_id.eq.${caller.userId},user_id.is.null`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // Table may not exist yet — return empty array gracefully
      if (error.message.includes("does not exist") || error.code === "42P01") {
        return apiJson({ notifications: [], unread_count: 0 });
      }
      return apiInternalError(error, "insurer.notifications");
    }

    const unreadCount = (data ?? []).filter((n) => !n.is_read).length;

    return apiJson({
      notifications: data ?? [],
      unread_count: unreadCount,
    });
  } catch (err) {
    return apiInternalError(err, "GET /api/insurer/notifications");
  }
}

/**
 * PATCH /api/insurer/notifications
 * Mark notification(s) as read.
 * Body: { ids: string[] } or { all: true }
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

  const { ids, all } = body as { ids?: string[]; all?: boolean };

  if (!all && (!Array.isArray(ids) || ids.length === 0)) {
    return apiValidationError("ids (string[]) or all (true) is required.");
  }

  const { admin } = createInsurerScopedAdmin(caller.insurerId);

  try {
    if (all) {
      // Mark all notifications for this user as read
      const { error } = await admin
        .from("insurer_notifications")
        .update({ is_read: true })
        .eq("insurer_id", caller.insurerId)
        .or(`user_id.eq.${caller.userId},user_id.is.null`)
        .eq("is_read", false);

      if (error) {
        if (error.message.includes("does not exist") || error.code === "42P01") {
          return apiJson({ ok: true, updated: 0 });
        }
        return apiInternalError(error, "insurer.notifications");
      }
    } else {
      // Mark specific notifications as read
      const { error } = await admin
        .from("insurer_notifications")
        .update({ is_read: true })
        .eq("insurer_id", caller.insurerId)
        .or(`user_id.eq.${caller.userId},user_id.is.null`)
        .in("id", ids!);

      if (error) {
        if (error.message.includes("does not exist") || error.code === "42P01") {
          return apiJson({ ok: true, updated: 0 });
        }
        return apiInternalError(error, "insurer.notifications");
      }
    }

    return apiJson({ ok: true });
  } catch (err) {
    return apiInternalError(err, "PATCH /api/insurer/notifications");
  }
}
