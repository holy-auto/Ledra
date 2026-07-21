import "reflect-metadata";
import { NextRequest } from "next/server";
import { z } from "zod";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { getWebAuthnConfig, OPERATION_CHALLENGE_TTL_MS } from "@/lib/webauthn/config";
import {
  OPERATION_TYPES,
  type OperationType,
  buildOperationPayload,
  computeOperationPayloadHash,
  newChallengeNonce,
  payloadHashToChallengeBytes,
} from "@/lib/webauthn/operation";

export const runtime = "nodejs";

const schema = z.object({
  operation_type: z.enum(OPERATION_TYPES as unknown as [OperationType, ...OperationType[]]),
  certificate_id: z.string().uuid(),
});

/**
 * POST /api/webauthn/operation/options
 * 重要操作の payload_hash をチャレンジにした authentication options を発行する。
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
    const { operation_type, certificate_id } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 対象証明書が自テナントのものか確認(越境防止)。
    const { data: cert } = await admin
      .from("certificates")
      .select("id")
      .eq("id", certificate_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!cert) return apiNotFound("証明書が見つかりません。");

    const { data: creds } = await admin
      .from("operator_credentials")
      .select("credential_id")
      .eq("user_id", caller.userId)
      .eq("is_active", true);
    if (!creds || creds.length === 0) {
      return apiValidationError("認証器が未登録です。先にパスキーを登録してください。");
    }

    const challengeNonce = newChallengeNonce();
    const payload = buildOperationPayload({
      operationType: operation_type,
      tenantId: caller.tenantId,
      certificateId: certificate_id,
      actorId: caller.userId,
      challengeNonce,
    });
    const payloadHash = computeOperationPayloadHash(payload);

    const cfg = getWebAuthnConfig();
    const options = await generateAuthenticationOptions({
      rpID: cfg.rpID,
      userVerification: "required",
      challenge: payloadHashToChallengeBytes(payloadHash),
      allowCredentials: creds.map((c) => ({ id: c.credential_id as string })),
    });

    const { data: challengeRow, error: chErr } = await admin
      .from("webauthn_challenges")
      .insert({
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        purpose: "authentication",
        challenge: options.challenge,
        operation_type,
        certificate_id,
        bound_payload_hash: payloadHash,
        expires_at: new Date(Date.now() + OPERATION_CHALLENGE_TTL_MS).toISOString(),
      })
      .select("id")
      .single();
    if (chErr) return apiInternalError(chErr, "webauthn/operation/options challenge");

    return apiOk({ options, challenge_id: challengeRow.id, payload_hash: payloadHash });
  } catch (e) {
    return apiInternalError(e, "webauthn/operation/options");
  }
}
