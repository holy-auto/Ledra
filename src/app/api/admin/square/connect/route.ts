import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiInternalError,
  apiError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: Square 連携ステータスを取得 ───
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const admin = getAdminClient();
    const { data: conn } = await admin
      .from("square_connections")
      .select("id, tenant_id, square_merchant_id, status, connected_at, last_synced_at, square_location_ids")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!conn) {
      return apiOk({
        id: null,
        tenant_id: caller.tenantId,
        square_merchant_id: null,
        status: "disconnected",
        connected_at: null,
        last_synced_at: null,
        square_location_ids: [],
      });
    }

    return apiOk(conn);
  } catch (e) {
    return apiInternalError(e, "square connect GET");
  }
}

// ─── POST: Square OAuth フロー開始 ───
export async function POST(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const clientId = process.env.SQUARE_APP_ID;
    if (!clientId) {
      return apiError({
        code: "internal_error",
        message:
          "Square連携の環境変数（SQUARE_APP_ID）が未設定です。",
        status: 503,
      });
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/square/callback`;
    const scopes = "ORDERS_READ+PAYMENTS_READ+MERCHANT_PROFILE_READ";
    const state = caller.tenantId;

    const authUrl =
      `https://connect.squareup.com/oauth2/authorize` +
      `?client_id=${clientId}` +
      `&scope=${scopes}` +
      `&state=${encodeURIComponent(state)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    return apiOk({ auth_url: authUrl });
  } catch (e) {
    return apiInternalError(e, "square connect POST");
  }
}

// ─── DELETE: Square 連携解除 ───
export async function DELETE(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const { error } = await admin
      .from("square_connections")
      .update({ status: "disconnected" })
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[square disconnect] db error:", error.message);
      return apiInternalError(error, "square disconnect");
    }

    return apiOk({ connected: false });
  } catch (e) {
    return apiInternalError(e, "square connect DELETE");
  }
}
