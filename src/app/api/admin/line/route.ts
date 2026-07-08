import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { buildSecretWrite } from "@/lib/crypto/tenantSecrets";

export const dynamic = "force-dynamic";

/** Webhook URL を組み立てる。env 未設定でもリクエスト origin にフォールバックして絶対URLを返す。 */
function buildWebhookUrl(req: NextRequest, tenantId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  return `${base}/api/line/webhook?tenant_id=${tenantId}`;
}

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
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: tenant, error } = await admin
      .from("tenants")
      .select("line_channel_id, line_liff_id, line_enabled, line_link_prompt_enabled")
      .eq("id", caller.tenantId)
      .single();
    if (error) throw error;

    return apiOk({
      enabled: !!tenant?.line_enabled,
      channel_id: tenant?.line_channel_id || null,
      liff_id: tenant?.line_liff_id || null,
      link_prompt_enabled: !!tenant?.line_link_prompt_enabled,
      webhook_url: tenant?.line_enabled ? buildWebhookUrl(req, caller.tenantId) : null,
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
      // 保存前に LINE API へ実際に問い合わせてトークンを検証する。
      // ここで弾かないと「保存は成功したが送受信できない」偽の連携完了になる。
      const botRes = await fetch("https://api.line.me/v2/bot/info", {
        headers: { Authorization: `Bearer ${data.channel_access_token}` },
      });
      if (botRes.status === 401) {
        return apiValidationError(
          "Channel Access Token が無効です。LINE Developers Console で長期トークンを再発行して貼り付けてください。",
        );
      }
      if (!botRes.ok) {
        return apiValidationError(`LINE API への接続確認に失敗しました (HTTP ${botRes.status})`);
      }

      const secretPayload = await buildSecretWrite(data.channel_secret);
      const accessTokenPayload = await buildSecretWrite(data.channel_access_token);

      const { error } = await admin
        .from("tenants")
        .update({
          line_channel_id: data.channel_id,
          line_channel_secret_ciphertext: secretPayload.ciphertext,
          line_channel_access_token_ciphertext: accessTokenPayload.ciphertext,
          line_liff_id: data.liff_id,
          line_enabled: true,
        })
        .eq("id", caller.tenantId);
      if (error) throw error;

      // bot 情報は「友だち追加リンク」の案内に使う (basicId 例: @123abcd)
      const bot = (await botRes.json().catch(() => null)) as { basicId?: string; displayName?: string } | null;

      return apiOk({
        enabled: true,
        webhook_url: buildWebhookUrl(req, caller.tenantId),
        bot_basic_id: bot?.basicId ?? null,
        bot_display_name: bot?.displayName ?? null,
      });
    }

    if (data.action === "set_link_prompt") {
      // 未紐づけユーザーへの連携案内の自動返信トグル。
      const { error } = await admin
        .from("tenants")
        .update({ line_link_prompt_enabled: data.enabled })
        .eq("id", caller.tenantId);
      if (error) throw error;
      return apiOk({ link_prompt_enabled: data.enabled });
    }

    // data.action === "disconnect"
    const { error: disconnectError } = await admin
      .from("tenants")
      .update({
        line_channel_id: null,
        line_channel_secret_ciphertext: null,
        line_channel_access_token_ciphertext: null,
        line_liff_id: null,
        line_enabled: false,
        // 連携解除時は案内トグルもクリアする (再連携で意図せず再有効化されないように)。
        line_link_prompt_enabled: false,
      })
      .eq("id", caller.tenantId);
    if (disconnectError) throw disconnectError;

    return apiOk({ enabled: false });
  } catch (e) {
    return apiInternalError(e, "line configure");
  }
}
