import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { getAdminClient } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/line
 * LINE 連携状態を取得
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const admin = getAdminClient();
    const { data: tenant } = await admin
      .from("tenants")
      .select("line_channel_id, line_liff_id, line_enabled")
      .eq("id", caller.tenantId)
      .single();

    return apiOk({
      enabled: !!tenant?.line_enabled,
      channel_id: tenant?.line_channel_id || null,
      liff_id: tenant?.line_liff_id || null,
      webhook_url: tenant?.line_enabled
        ? `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/line/webhook?tenant_id=${caller.tenantId}`
        : null,
    });
  } catch (e) {
    return apiInternalError(e, "line status");
  }
}

/**
 * POST /api/admin/line
 * LINE 連携設定の更新
 *
 * Body:
 *   action: "configure" | "disconnect"
 *   channel_id?: string
 *   channel_secret?: string
 *   channel_access_token?: string
 *   liff_id?: string
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const admin = getAdminClient();

    if (action === "configure") {
      const channelId = body?.channel_id;
      const channelSecret = body?.channel_secret;
      const channelAccessToken = body?.channel_access_token;

      if (!channelId || !channelSecret || !channelAccessToken) {
        return apiValidationError("channel_id, channel_secret, channel_access_token は必須です");
      }

      await admin
        .from("tenants")
        .update({
          line_channel_id: channelId,
          line_channel_secret: channelSecret,
          line_channel_access_token: channelAccessToken,
          line_liff_id: body?.liff_id || null,
          line_enabled: true,
        })
        .eq("id", caller.tenantId);

      return apiOk({
        enabled: true,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/line/webhook?tenant_id=${caller.tenantId}`,
      });
    }

    if (action === "disconnect") {
      await admin
        .from("tenants")
        .update({
          line_channel_id: null,
          line_channel_secret: null,
          line_channel_access_token: null,
          line_liff_id: null,
          line_enabled: false,
        })
        .eq("id", caller.tenantId);

      return apiOk({ enabled: false });
    }

    return apiValidationError("action は configure / disconnect のいずれかです");
  } catch (e) {
    return apiInternalError(e, "line configure");
  }
}
