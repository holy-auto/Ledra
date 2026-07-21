import "reflect-metadata"; // tsyringe(@peculiar/x509 経由・@simplewebauthn 等)が要求する Reflect polyfill。x509/simplewebauthn より前に読む。
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

const schema = z
  .object({
    operation_type: z.enum(OPERATION_TYPES as unknown as [OperationType, ...OperationType[]]),
    // 証明書は内部 UUID か公開 ID(public_id)のどちらでも指定できる。
    // 新規発行フローは public_id しか持たないため public_id 経由を許容する。
    certificate_id: z.string().uuid().optional(),
    public_id: z.string().trim().min(1).optional(),
  })
  .refine((d) => d.certificate_id || d.public_id, {
    message: "certificate_id か public_id のいずれかが必要です。",
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
    const { operation_type } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 対象証明書が自テナントのものか確認(越境防止)。UUID か public_id で逆引きし、
    // 以後は必ず内部 UUID(certificateId)で payload/challenge を束ねる(gate も UUID で照合するため)。
    const baseQuery = admin.from("certificates").select("id").eq("tenant_id", caller.tenantId);
    const { data: cert } = parsed.data.certificate_id
      ? await baseQuery.eq("id", parsed.data.certificate_id).maybeSingle()
      : await baseQuery.eq("public_id", parsed.data.public_id as string).maybeSingle();
    if (!cert) return apiNotFound("証明書が見つかりません。");
    const certificateId = cert.id as string;

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
      certificateId,
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
        certificate_id: certificateId,
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
