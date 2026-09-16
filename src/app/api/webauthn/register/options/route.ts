import "reflect-metadata"; // tsyringe(@peculiar/x509 経由・@simplewebauthn 等)が要求する Reflect polyfill。x509/simplewebauthn より前に読む。

import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

import { apiOk, apiInternalError } from "@/lib/api/response";
import { getWebAuthnConfig, REGISTRATION_CHALLENGE_TTL_MS } from "@/lib/webauthn/config";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";

/**
 * POST /api/webauthn/register/options
 * 認証器登録(パスキー enrollment)の options を発行し、チャレンジをサーバー保存する。
 */
export const POST = withCaller(
  async (_req, { caller, supabase }) => {
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userName = userRes?.user?.email ?? caller.userId;

      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const { data: existing } = await admin
        .from("operator_credentials")
        .select("credential_id")
        .eq("user_id", caller.userId)
        .eq("is_active", true);

      const cfg = getWebAuthnConfig();
      const options = await generateRegistrationOptions({
        rpName: cfg.rpName,
        rpID: cfg.rpID,
        userName,
        userID: new TextEncoder().encode(caller.userId),
        attestationType: "none",
        // 本人確認(PIN/生体)を必須にし、共有アカウントでの無言登録を抑止する。
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
        // 同一認証器の二重登録を防ぐ。
        excludeCredentials: (existing ?? []).map((c) => ({ id: c.credential_id as string })),
      });

      await admin.from("webauthn_challenges").insert({
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        purpose: "registration",
        challenge: options.challenge,
        expires_at: new Date(Date.now() + REGISTRATION_CHALLENGE_TTL_MS).toISOString(),
      });

      return apiOk({ options });
    } catch (e) {
      return apiInternalError(e, "webauthn/register/options");
    }
  },
  { rateLimit: "auth", routeName: "webauthn/register/options" },
);
