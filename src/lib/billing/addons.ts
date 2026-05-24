/**
 * Per-tenant feature add-ons.
 *
 * Some Ledra features (中古車マーケット, B2B 案件, Deals) costed
 * engineering attention but did not map onto the Lighthouse (損保ジャパン)
 * requirements. Per `docs/ledra-goals-strategy-2026-05.md` §6 they are
 * being moved off the default Standard plan into opt-in add-ons.
 *
 * Lifecycle:
 *   - Existing tenants with data are grandfathered in by migration
 *     20260514000000_tenant_addons.sql
 *   - New tenants do NOT receive add-ons by default; a platform admin
 *     enables them after a separate contract / billing arrangement
 *   - `disabled_at IS NOT NULL` means "previously enabled, now off" —
 *     the row is kept for audit / billing reconciliation
 *
 * This is a deliberately SOFT gate. The runtime check is here for
 * server-side route handlers + UI hiding; we have not enforced
 * platform admin gating on the underlying tables themselves. That
 * extra rigour can come if/when a tenant tries to abuse the add-on
 * (none are gated by tenant_addons yet on the data plane).
 */

import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical addon keys. Adding a new one needs a matching UI + (optional) billing entry. */
export const ADDON_KEYS = {
  market_vehicles: "market_vehicles",
  btob: "btob",
  deals: "deals",
} as const;

export type AddonKey = (typeof ADDON_KEYS)[keyof typeof ADDON_KEYS];

const ALL_ADDON_KEYS = Object.values(ADDON_KEYS) as readonly AddonKey[];

export function isKnownAddonKey(value: string): value is AddonKey {
  return (ALL_ADDON_KEYS as readonly string[]).includes(value);
}

/**
 * Display catalog for the UI. Keep label/description in sync with the
 * docs (docs/ledra-goals-strategy-2026-05.md §6) so support / sales /
 * settings screens speak the same language.
 */
export type AddonCatalogEntry = {
  key: AddonKey;
  label: string;
  description: string;
  /** Primary route the addon unlocks — used to show a "ここを開放" hint. */
  primaryRoute: string;
};

export const ADDON_CATALOG: readonly AddonCatalogEntry[] = [
  {
    key: ADDON_KEYS.market_vehicles,
    label: "中古車マーケット",
    description: "中古車の出品・閲覧・取引機能。販売店・買取店向けのアドオンです。",
    primaryRoute: "/market",
  },
  {
    key: ADDON_KEYS.btob,
    label: "B2B 案件 (施工店間受発注)",
    description: "他施工店との案件受発注・マッチングハブ。協業ネットワーク参加店舗向け。",
    primaryRoute: "/admin/btob",
  },
  {
    key: ADDON_KEYS.deals,
    label: "商談管理 (Deals)",
    description: "商談パイプライン・営業活動の追跡。BtoB 営業を行うテナント向け。",
    primaryRoute: "/admin/deals",
  },
];

/**
 * Check whether an add-on is currently enabled for a tenant.
 *
 * Returns `false` when:
 *   - No row exists for (tenant_id, addon_key)
 *   - A row exists with `disabled_at` set (soft-disabled)
 *   - The DB call errors — fail closed (deny by default) so a transient
 *     blip cannot silently grant unrelated features.
 */
export async function isAddonEnabled(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  tenantId: string,
  key: AddonKey,
): Promise<boolean> {
  const { data, error } = await admin
    .from("tenant_addons")
    .select("disabled_at")
    .eq("tenant_id", tenantId)
    .eq("addon_key", key)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn("isAddonEnabled: lookup failed, denying access", {
      tenantId,
      key,
      error: error.message,
    });
    return false;
  }

  if (!data) return false;
  return data.disabled_at === null || data.disabled_at === undefined;
}

/**
 * Fetch the full set of enabled add-ons for a tenant in one call.
 * Useful for layout-time UI hiding (single query per request rather
 * than one per add-on).
 */
export async function listEnabledAddons(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  tenantId: string,
): Promise<Set<AddonKey>> {
  const { data, error } = await admin.from("tenant_addons").select("addon_key, disabled_at").eq("tenant_id", tenantId);

  if (error) {
    logger.warn("listEnabledAddons: lookup failed, returning empty set", {
      tenantId,
      error: error.message,
    });
    return new Set();
  }

  const enabled = new Set<AddonKey>();
  for (const row of (data ?? []) as { addon_key: string; disabled_at: string | null }[]) {
    if (row.disabled_at) continue;
    if (isKnownAddonKey(row.addon_key)) enabled.add(row.addon_key);
  }
  return enabled;
}

/**
 * Enable an add-on for a tenant. Idempotent — if the row already exists
 * the `disabled_at` field is cleared so a previously-disabled add-on can
 * be turned back on.
 *
 * Platform-admin only at the call site (this helper does not enforce
 * authorization itself). Caller is responsible for invoking only after
 * `requirePlatformAdmin()` or equivalent.
 */
export async function enableAddon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  tenantId: string,
  key: AddonKey,
  notes?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await admin.from("tenant_addons").upsert(
    {
      tenant_id: tenantId,
      addon_key: key,
      enabled_at: now,
      disabled_at: null,
      notes: notes ?? null,
    },
    { onConflict: "tenant_id,addon_key" },
  );

  if (error) {
    logger.warn("enableAddon: upsert failed", { tenantId, key, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Soft-disable an add-on. The row stays for audit; `isAddonEnabled` will
 * now return `false`. Re-enabling via `enableAddon` clears `disabled_at`.
 */
export async function disableAddon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  tenantId: string,
  key: AddonKey,
  notes?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: { disabled_at: string; notes?: string } = {
    disabled_at: new Date().toISOString(),
  };
  if (notes) patch.notes = notes;

  const { error } = await admin.from("tenant_addons").update(patch).eq("tenant_id", tenantId).eq("addon_key", key);

  if (error) {
    logger.warn("disableAddon: update failed", { tenantId, key, error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
