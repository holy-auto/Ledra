import { NextRequest } from "next/server";
import { z } from "zod";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { getWebAuthnConfig } from "@/lib/webauthn/config";
import { toWebAuthnCredential } from "@/lib/webauthn/credential";

export const runtime = "nodejs";

const schema = z.object({
  challenge_id: z.string().uuid(),
  response: z.object({ id: z.string() }).passthrough(),
});

/**
 * POST /api/webauthn/operation/verify
 * 操作署名の assertion を検証し、webauthn_assertions に不変記録する。
 * チャレンジの消費(単回利用)は業務操作側(finalize/void 等のゲート)で行うため、ここでは消費しない。
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
    const response = parsed.data.response as unknown as AuthenticationResponseJSON;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: ch } = await admin
      .from("webauthn_challenges")
      .select("id, challenge, operation_type, certificate_id, bound_payload_hash, expires_at, consumed_at")
      .eq("id", parsed.data.challenge_id)
      .eq("user_id", caller.userId)
      .eq("purpose", "authentication")
      .maybeSingle();
    if (!ch) return apiValidationError("有効な操作チャレンジがありません。");
    if (ch.consumed_at) return apiValidationError("このチャレンジは既に使用済みです。");
    if (new Date(ch.expires_at as string).getTime() < Date.now()) {
      return apiValidationError("チャレンジの有効期限が切れています。");
    }

    // 応答の credential に対応する登録済みクレデンシャルを取得。
    const { data: cred } = await admin
      .from("operator_credentials")
      .select("credential_id, public_key, counter, transports")
      .eq("user_id", caller.userId)
      .eq("credential_id", response.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!cred) return apiValidationError("登録済みの認証器が見つかりません。");

    const cfg = getWebAuthnConfig();
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ch.challenge as string,
      expectedOrigin: cfg.origins,
      expectedRPID: cfg.rpID,
      requireUserVerification: true,
      // transports の string[] → AuthenticatorTransportFuture[](リテラル union)への
      // narrowing のみのため WebAuthnCredential へキャストする。
      credential: toWebAuthnCredential({
        credential_id: cred.credential_id as string,
        public_key: cred.public_key as string,
        counter: cred.counter as number,
        transports: (cred.transports as string[] | null) ?? null,
      }) as WebAuthnCredential,
    });
    if (!verification.verified) return apiValidationError("操作署名の検証に失敗しました。");

    const info = verification.authenticationInfo;
    const { data: assertion, error: insErr } = await admin
      .from("webauthn_assertions")
      .insert({
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        credential_id: cred.credential_id,
        certificate_id: ch.certificate_id,
        operation_type: ch.operation_type,
        challenge_id: ch.id,
        bound_payload_hash: ch.bound_payload_hash,
        authenticator_data: response.response.authenticatorData,
        client_data_json: response.response.clientDataJSON,
        signature: response.response.signature,
        user_verified: info.userVerified,
        new_counter: info.newCounter,
      })
      .select("id")
      .single();
    if (insErr) return apiInternalError(insErr, "webauthn/operation/verify assertion");

    // カウンタ前進(同期パスキーは 0 のまま。best-effort)。
    await admin
      .from("operator_credentials")
      .update({ counter: info.newCounter, last_used_at: new Date().toISOString() })
      .eq("credential_id", cred.credential_id)
      .eq("user_id", caller.userId);

    return apiOk({
      verified: true,
      assertion_id: assertion.id,
      challenge_id: ch.id,
      payload_hash: ch.bound_payload_hash,
    });
  } catch (e) {
    return apiInternalError(e, "webauthn/operation/verify");
  }
}
