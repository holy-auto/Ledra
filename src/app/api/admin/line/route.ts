import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { buildSecretWrite } from "@/lib/crypto/tenantSecrets";

export const dynamic = "force-dynamic";

const lineActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("configure"),
    channel_id: z.string().trim().min(1, "channel_id は必須です").max(100),
    channel_secret: z.string().trim().min(1, "channel_secret は必須です").max(200),
    channel_access_token: z.string().trim().min(1, "channel_access_token は必須です").max(500),
    liff_id: z
      .string()
      .trim()
      .max(100)
      .nullable()
      .optional()
      .transform((v) => v || null),
  }),
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("set_link_prompt"), enabled: z.boolean() }),
]);

/**
 * GET /api/admin/line
 * LINE 連携状態を取得
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant } = await admin
      .from("tenants")
      .select("line_channel_id, line_liff_id, line_enabled, line_link_prompt_enabled")
      .eq("id", caller.tenantId)
      .single();

    return apiOk({
      enabled: !!tenant?.line_enabled,
      channel_id: tenant?.line_channel_id || null,
      liff_id: tenant?.line_liff_id || null,
      link_prompt_enabled: !!tenant?.line_link_prompt_enabled,
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
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const parsed = lineActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const data = parsed.data;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    if (data.action === "configure") {
      const secretPayload = await buildSecretWrite(data.channel_secret);
      const accessTokenPayload = await buildSecretWrite(data.channel_access_token);

      await admin
        .from("tenants")
        .update({
          line_channel_id: data.channel_id,
          line_channel_secret_ciphertext: secretPayload.ciphertext,
          line_channel_access_token_ciphertext: accessTokenPayload.ciphertext,
          line_liff_id: data.liff_id,
          line_enabled: true,
        })
        .eq("id", caller.tenantId);

      return apiOk({
        enabled: true,
        webhook_url: `${process.env.NEXT_PUBLIC_APP_URL || ""}/api/line/webhook?tenant_id=${caller.tenantId}`,
      });
    }

    if (data.action === "set_link_prompt") {
      // 未紐づけユーザーへの連携案内の自動返信トグル。
      await admin.from("tenants").update({ line_link_prompt_enabled: data.enabled }).eq("id", caller.tenantId);
      return apiOk({ link_prompt_enabled: data.enabled });
    }

    // data.action === "disconnect"
    await admin
      .from("tenants")
      .update({
        line_channel_id: null,
        line_channel_secret_ciphertext: null,
        line_channel_access_token_ciphertext: null,
        line_liff_id: null,
        line_enabled: false,
      })
      .eq("id", caller.tenantId);

    return apiOk({ enabled: false });
  } catch (e) {
    return apiInternalError(e, "line configure");
  }
}
