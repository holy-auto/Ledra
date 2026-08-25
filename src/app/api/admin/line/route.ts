import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { buildSecretWrite, readSecret } from "@/lib/crypto/tenantSecrets";
import { LineApiError, provisionLineChannel, verifyWithExistingToken } from "@/lib/line/provisioning";

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
    // 任意。省略すると Channel ID + Secret から Ledra が自動発行する（通常はこちら）。
    // 既に長期トークンを手で発行して運用している加盟店のために、明示指定も残す。
    channel_access_token: z.string().trim().min(1).max(500).optional(),
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
  // 連携後の「接続を再確認」。トークンを発行し直し、Webhook URL を設定し直して
  // 配送テストまで行う。30日で失効するトークンの手動復旧口も兼ねる。
  z.object({ action: z.literal("verify") }),
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
      .select("line_channel_id, line_liff_id, line_enabled, line_link_prompt_enabled, line_channel_token_expires_at")
      .eq("id", caller.tenantId)
      .single();
    if (error) throw error;

    return apiOk({
      enabled: !!tenant?.line_enabled,
      channel_id: tenant?.line_channel_id || null,
      liff_id: tenant?.line_liff_id || null,
      link_prompt_enabled: !!tenant?.line_link_prompt_enabled,
      webhook_url: tenant?.line_enabled ? buildWebhookUrl(req, caller.tenantId) : null,
      // true = Ledra がトークンを発行・自動更新している（加盟店の発行作業なし）。
      // false = 手入力の長期トークンで運用中の既存テナント。
      token_auto_managed: !!tenant?.line_channel_token_expires_at,
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
      const webhookUrl = buildWebhookUrl(req, caller.tenantId);

      // Channel ID + Secret から Ledra がトークンを発行し、Webhook URL も
      // LINE 側に設定して配送テストまで済ませる。加盟店の Console 作業を消すのが目的。
      // 手入力の長期トークンが渡された場合だけ、それを使う従来経路に落とす。
      let provisioned;
      try {
        provisioned = data.channel_access_token
          ? await verifyWithExistingToken(data.channel_access_token, webhookUrl)
          : await provisionLineChannel({
              channelId: data.channel_id,
              channelSecret: data.channel_secret,
              webhookUrl,
            });
      } catch (e) {
        // 「保存は成功したが送受信できない」偽の連携完了を作らないため、
        // LINE に繋がらない時点で保存せず理由をそのまま返す。
        if (e instanceof LineApiError) return apiValidationError(e.message);
        throw e;
      }

      const secretPayload = await buildSecretWrite(data.channel_secret);
      const accessTokenPayload = await buildSecretWrite(provisioned.token.accessToken);

      const { error } = await admin
        .from("tenants")
        .update({
          line_channel_id: data.channel_id,
          line_channel_secret_ciphertext: secretPayload.ciphertext,
          line_channel_access_token_ciphertext: accessTokenPayload.ciphertext,
          // 手入力の長期トークンは無期限なので NULL を入れ、自動再発行の対象外にする。
          line_channel_token_expires_at: provisioned.token.expiresAt,
          line_liff_id: data.liff_id,
          line_enabled: true,
        })
        .eq("id", caller.tenantId);
      if (error) throw error;

      return apiOk({
        enabled: true,
        webhook_url: webhookUrl,
        // bot 情報は「友だち追加リンク」の案内に使う (basicId 例: @123abcd)
        bot_basic_id: provisioned.bot.basicId,
        bot_display_name: provisioned.bot.displayName,
        webhook_active: provisioned.webhook.active,
        webhook_test_ok: provisioned.test.success,
        manual_steps: provisioned.manualSteps,
      });
    }

    if (data.action === "verify") {
      const { data: tenant } = await admin
        .from("tenants")
        .select("line_channel_id, line_channel_secret_ciphertext")
        .eq("id", caller.tenantId)
        .single();
      const channelId = (tenant?.line_channel_id as string | null) ?? null;
      const channelSecret = await readSecret(
        tenant?.line_channel_secret_ciphertext as string | null,
        "tenants.line_channel_secret",
      );
      if (!channelId || !channelSecret) {
        return apiValidationError("先に Channel ID と Channel Secret を登録してください。");
      }

      const webhookUrl = buildWebhookUrl(req, caller.tenantId);
      let provisioned;
      try {
        provisioned = await provisionLineChannel({ channelId, channelSecret, webhookUrl });
      } catch (e) {
        if (e instanceof LineApiError) return apiValidationError(e.message);
        throw e;
      }

      // 再確認では新しいトークンが発行されるので、保存も更新する（失効の復旧口）。
      const accessTokenPayload = await buildSecretWrite(provisioned.token.accessToken);
      const { error } = await admin
        .from("tenants")
        .update({
          line_channel_access_token_ciphertext: accessTokenPayload.ciphertext,
          line_channel_token_expires_at: provisioned.token.expiresAt,
        })
        .eq("id", caller.tenantId);
      if (error) throw error;

      return apiOk({
        enabled: true,
        webhook_url: webhookUrl,
        bot_basic_id: provisioned.bot.basicId,
        bot_display_name: provisioned.bot.displayName,
        webhook_active: provisioned.webhook.active,
        webhook_test_ok: provisioned.test.success,
        manual_steps: provisioned.manualSteps,
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
        line_channel_token_expires_at: null,
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
