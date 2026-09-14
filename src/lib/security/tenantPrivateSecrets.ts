import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSecretWrite, readSecret } from "@/lib/crypto/tenantSecrets";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

type PrivateSecretRow = {
  tenant_id: string;
  gcal_refresh_token_ciphertext: string | null;
  external_api_key_hash: string | null;
  external_api_key_last4: string | null;
  email_inbound_token_hash: string | null;
  email_inbound_token_ciphertext: string | null;
  gcal_refresh_token_legacy: string | null;
  external_api_key_legacy: string | null;
  email_inbound_token_legacy: string | null;
};

export function hashTenantBearerToken(kind: "external_api" | "email_inbound", token: string): string {
  return createHash("sha256").update(`ledra:${kind}:v1:${token}`, "utf8").digest("hex");
}

async function getRow(admin: Db, tenantId: string): Promise<PrivateSecretRow | null> {
  const { data, error } = await admin
    .from("tenant_private_secrets")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw error;
  return data as PrivateSecretRow | null;
}

export async function readGcalRefreshToken(admin: Db, tenantId: string): Promise<string | null> {
  const row = await getRow(admin, tenantId);
  if (!row) return null;
  if (row.gcal_refresh_token_ciphertext) {
    return readSecret(row.gcal_refresh_token_ciphertext, "tenant_private_secrets.gcal_refresh_token");
  }
  if (!row.gcal_refresh_token_legacy) return null;

  const raw = row.gcal_refresh_token_legacy;
  const { ciphertext } = await buildSecretWrite(raw);
  const { error } = await admin
    .from("tenant_private_secrets")
    .update({ gcal_refresh_token_ciphertext: ciphertext, gcal_refresh_token_legacy: null })
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return raw;
}

export async function writeGcalRefreshToken(admin: Db, tenantId: string, token: string | null): Promise<void> {
  const { ciphertext } = await buildSecretWrite(token);
  const { error } = await admin.from("tenant_private_secrets").upsert(
    {
      tenant_id: tenantId,
      gcal_refresh_token_ciphertext: ciphertext,
      gcal_refresh_token_legacy: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

export async function getExternalApiKeyStatus(
  admin: Db,
  tenantId: string,
): Promise<{ active: boolean; last4: string | null }> {
  const row = await getRow(admin, tenantId);
  return {
    active: Boolean(row?.external_api_key_hash || row?.external_api_key_legacy),
    last4: row?.external_api_key_last4 ?? null,
  };
}

export async function writeExternalApiKey(admin: Db, tenantId: string, token: string | null): Promise<void> {
  const { error } = await admin.from("tenant_private_secrets").upsert(
    {
      tenant_id: tenantId,
      external_api_key_hash: token ? hashTenantBearerToken("external_api", token) : null,
      external_api_key_last4: token ? token.slice(-4) : null,
      external_api_key_legacy: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

export async function findTenantIdByExternalApiKey(admin: Db, token: string): Promise<string | null> {
  const hash = hashTenantBearerToken("external_api", token);
  const { data, error } = await admin
    .from("tenant_private_secrets")
    .select("tenant_id")
    .eq("external_api_key_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (data?.tenant_id) return data.tenant_id as string;

  const { data: legacy, error: legacyError } = await admin
    .from("tenant_private_secrets")
    .select("tenant_id")
    .eq("external_api_key_legacy", token)
    .maybeSingle();
  if (legacyError) throw legacyError;
  if (!legacy?.tenant_id) return null;
  await writeExternalApiKey(admin, legacy.tenant_id as string, token);
  return legacy.tenant_id as string;
}

export async function readInboundEmailToken(admin: Db, tenantId: string): Promise<string | null> {
  const row = await getRow(admin, tenantId);
  if (!row) return null;
  if (row.email_inbound_token_ciphertext) {
    return readSecret(row.email_inbound_token_ciphertext, "tenant_private_secrets.email_inbound_token");
  }
  if (!row.email_inbound_token_legacy) return null;

  const raw = row.email_inbound_token_legacy;
  await writeInboundEmailToken(admin, tenantId, raw);
  return raw;
}

export async function writeInboundEmailToken(admin: Db, tenantId: string, token: string | null): Promise<void> {
  const { ciphertext } = await buildSecretWrite(token);
  const { error } = await admin.from("tenant_private_secrets").upsert(
    {
      tenant_id: tenantId,
      email_inbound_token_hash: token ? hashTenantBearerToken("email_inbound", token) : null,
      email_inbound_token_ciphertext: ciphertext,
      email_inbound_token_legacy: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw error;
}

export async function findTenantIdByInboundEmailToken(admin: Db, token: string): Promise<string | null> {
  const hash = hashTenantBearerToken("email_inbound", token);
  const { data, error } = await admin
    .from("tenant_private_secrets")
    .select("tenant_id")
    .eq("email_inbound_token_hash", hash)
    .maybeSingle();
  if (error) throw error;
  if (data?.tenant_id) return data.tenant_id as string;

  const { data: legacy, error: legacyError } = await admin
    .from("tenant_private_secrets")
    .select("tenant_id")
    .eq("email_inbound_token_legacy", token)
    .maybeSingle();
  if (legacyError) throw legacyError;
  if (!legacy?.tenant_id) return null;
  await writeInboundEmailToken(admin, legacy.tenant_id as string, token);
  return legacy.tenant_id as string;
}
