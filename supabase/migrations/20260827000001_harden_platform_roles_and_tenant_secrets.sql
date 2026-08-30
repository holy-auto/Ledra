-- Security boundary hardening:
--   1. tenant owners can never mint or modify super_admin memberships.
--   2. bearer/OAuth secrets are removed from the member-readable tenants row.

-- Defense in depth: this trigger survives future RLS policy changes. Requests made
-- with an authenticated end-user JWT may never write the platform-only role.
CREATE OR REPLACE FUNCTION public.block_end_user_super_admin_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND (
       NEW.role::text = 'super_admin'
       OR (TG_OP = 'UPDATE' AND OLD.role::text = 'super_admin')
     )
  THEN
    RAISE EXCEPTION 'super_admin memberships are platform-managed only'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_end_user_super_admin_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_block_end_user_super_admin_assignment ON public.tenant_memberships;
CREATE TRIGGER trg_block_end_user_super_admin_assignment
  BEFORE INSERT OR UPDATE OF role ON public.tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION public.block_end_user_super_admin_assignment();

-- Replace the owner policies as well, so the rejection happens in RLS before the
-- trigger and cannot be bypassed by changing unrelated membership columns.
DROP POLICY IF EXISTS "tenant_memberships_insert_v2" ON public.tenant_memberships;
DROP POLICY IF EXISTS "tenant_memberships_update_v2" ON public.tenant_memberships;

CREATE POLICY "tenant_memberships_insert_v2" ON public.tenant_memberships
  FOR INSERT WITH CHECK (
    tenant_id IN (SELECT public.my_tenant_ids())
    AND public.my_tenant_role(tenant_id) = 'owner'
    AND role::text <> 'super_admin'
  );

CREATE POLICY "tenant_memberships_update_v2" ON public.tenant_memberships
  FOR UPDATE USING (
    tenant_id IN (SELECT public.my_tenant_ids())
    AND public.my_tenant_role(tenant_id) = 'owner'
    AND role::text <> 'super_admin'
  ) WITH CHECK (
    tenant_id IN (SELECT public.my_tenant_ids())
    AND public.my_tenant_role(tenant_id) = 'owner'
    AND role::text <> 'super_admin'
  );

-- Secrets must not share a row with ordinary tenant settings: row-level security
-- cannot hide individual columns. This table has no end-user policies and no
-- anon/authenticated grants; only the backend service role can access it.
CREATE TABLE IF NOT EXISTS public.tenant_private_secrets (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  gcal_refresh_token_ciphertext text,
  external_api_key_hash text,
  external_api_key_last4 text,
  email_inbound_token_hash text,
  email_inbound_token_ciphertext text,
  -- Existing plaintext is quarantined here during deploy and is encrypted/hashed
  -- by the application on first use. These columns are never user-readable.
  gcal_refresh_token_legacy text,
  external_api_key_legacy text,
  email_inbound_token_legacy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_private_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_private_secrets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_private_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tenant_private_secrets TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_private_secrets_external_key_hash
  ON public.tenant_private_secrets(external_api_key_hash)
  WHERE external_api_key_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_private_secrets_email_token_hash
  ON public.tenant_private_secrets(email_inbound_token_hash)
  WHERE email_inbound_token_hash IS NOT NULL;

INSERT INTO public.tenant_private_secrets (
  tenant_id,
  gcal_refresh_token_legacy,
  external_api_key_legacy,
  external_api_key_last4,
  email_inbound_token_legacy
)
SELECT
  id,
  gcal_refresh_token,
  external_api_key,
  CASE WHEN external_api_key IS NULL THEN NULL ELSE right(external_api_key, 4) END,
  email_inbound_token
FROM public.tenants
WHERE gcal_refresh_token IS NOT NULL
   OR external_api_key IS NOT NULL
   OR email_inbound_token IS NOT NULL
ON CONFLICT (tenant_id) DO UPDATE SET
  gcal_refresh_token_legacy = COALESCE(
    public.tenant_private_secrets.gcal_refresh_token_legacy,
    EXCLUDED.gcal_refresh_token_legacy
  ),
  external_api_key_legacy = COALESCE(
    public.tenant_private_secrets.external_api_key_legacy,
    EXCLUDED.external_api_key_legacy
  ),
  external_api_key_last4 = COALESCE(
    public.tenant_private_secrets.external_api_key_last4,
    EXCLUDED.external_api_key_last4
  ),
  email_inbound_token_legacy = COALESCE(
    public.tenant_private_secrets.email_inbound_token_legacy,
    EXCLUDED.email_inbound_token_legacy
  );

ALTER TABLE public.tenants
  DROP COLUMN IF EXISTS gcal_refresh_token,
  DROP COLUMN IF EXISTS external_api_key,
  DROP COLUMN IF EXISTS email_inbound_token;

COMMENT ON TABLE public.tenant_private_secrets IS
  'Service-role-only tenant credentials. Ciphertexts use SECRET_ENCRYPTION_KEY; bearer tokens are looked up by SHA-256 hash.';
