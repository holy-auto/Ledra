import "reflect-metadata"; // tsyringe(@peculiar/x509 経由・@simplewebauthn 等)が要求する Reflect polyfill。x509/simplewebauthn より前に読む。
import { NextRequest } from "next/server";
import { z } from "zod";
import { verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { getWebAuthnConfig } from "@/lib/webauthn/config";
import { buildOperatorCredentialInsert } from "@/lib/webauthn/credential";

export const runtime = "nodejs";

const schema = z.object({
  // WebAuthn の応答は形が複雑なので通し、実体の検証は verifyRegistrationResponse に委ねる。
  response: z.object({ id: z.string() }).passthrough(),
  device_label: z.string().trim().max(100).optional(),
});

/**
 * POST /api/webauthn/register/verify
 * navigator.credentials.create() の応答を検証し、operator_credentials に登録する。
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "auth");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 直近の未消費・登録用チャレンジを取得(サーバー生成・一度限り)。
    const { data: ch } = await admin
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", caller.userId)
      .eq("purpose", "registration")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ch) return apiValidationError("有効な登録チャレンジがありません。もう一度お試しください。");
    if (new Date(ch.expires_at as string).getTime() < Date.now()) {
      return apiValidationError("チャレンジの有効期限が切れています。もう一度お試しください。");
    }

    const cfg = getWebAuthnConfig();
    const verification = await verifyRegistrationResponse({
      response: parsed.data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: ch.challenge as string,
      expectedOrigin: cfg.origins,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      return apiValidationError("認証器の検証に失敗しました。");
    }

    const row = buildOperatorCredentialInsert(verification.registrationInfo, {
      tenantId: caller.tenantId,
      userId: caller.userId,
      deviceLabel: parsed.data.device_label ?? null,
    });

    const { error: insErr } = await admin.from("operator_credentials").insert(row);
    // チャレンジは成否に関わらず消費して再利用(リプレイ)を防ぐ。
    await admin.from("webauthn_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", ch.id);
    if (insErr) {
      if (insErr.code === "23505") return apiValidationError("この認証器は既に登録済みです。");
      return apiInternalError(insErr, "webauthn/register/verify insert");
    }

    return apiOk({ verified: true, credential_id: row.credential_id });
  } catch (e) {
    return apiInternalError(e, "webauthn/register/verify");
  }
}
