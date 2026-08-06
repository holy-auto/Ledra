import { createHash, randomBytes } from "node:crypto";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { scopeFromRow, type ReportScope } from "@/lib/vehicleReport/tiers";

/** Fallback price when the settings row is missing/unreadable. */
export const DEFAULT_REPORT_PRICE_JPY = 3000;

/** How long a paid report stays viewable after purchase. */
export const REPORT_ACCESS_VALIDITY_DAYS = 30;

export type VehicleReportSettings = {
  price_jpy: number;
  enabled: boolean;
};

/**
 * Platform-wide report pricing. The passport history spans multiple
 * tenants, so pricing is a single Ledra-level decision (not per-tenant).
 */
export async function getVehicleReportSettings(): Promise<VehicleReportSettings> {
  const admin = createServiceRoleAdmin("vehicle report settings — platform-wide singleton pricing");
  const { data } = await admin.from("vehicle_report_settings").select("price_jpy, enabled").eq("id", 1).maybeSingle();

  const row = data as { price_jpy: number | null; enabled: boolean | null } | null;
  return {
    price_jpy: typeof row?.price_jpy === "number" ? row.price_jpy : DEFAULT_REPORT_PRICE_JPY,
    enabled: row?.enabled ?? true,
  };
}

/** Opaque, account-less access token persisted on the order row. */
export function generateReportAccessToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Per-vehicle cookie name. The VIN itself is hashed so the raw VIN is
 * never written into a client-readable cookie name.
 */
export function reportCookieName(vinNormalized: string): string {
  const h = createHash("sha256").update(vinNormalized).digest("hex").slice(0, 16);
  return `vrt_${h}`;
}

export type ValidReportAccess = {
  id: string;
  vin_code_normalized: string;
  expires_at: string | null;
  /** The disclosure scope this purchase unlocked (relative — used for labels). */
  scope: ReportScope;
  /** Absolute lower bound (ISO) resolved at purchase; null = no bound (full). */
  scopeFromIso: string | null;
};

/**
 * True iff `token` is a paid, non-expired report order for `vinNormalized`.
 * Used by the gated `/v/[vin]` page; anonymous callers, service role only.
 * Returns the purchase's disclosure scope so the page shows only the records
 * that purchase paid for.
 */
export async function findValidReportAccess(
  vinNormalized: string,
  token: string | null | undefined,
): Promise<ValidReportAccess | null> {
  if (!token || !vinNormalized) return null;

  const admin = createServiceRoleAdmin("vehicle report access — anonymous token check for /v/[vin]");
  const { data } = await admin
    .from("vehicle_report_orders")
    .select("id, vin_code_normalized, status, expires_at, scope_type, scope_months, scope_from")
    .eq("access_token", token)
    .eq("vin_code_normalized", vinNormalized)
    .eq("status", "paid")
    .maybeSingle();

  const row = data as {
    id: string;
    vin_code_normalized: string;
    status: string;
    expires_at: string | null;
    scope_type: string | null;
    scope_months: number | null;
    scope_from: string | null;
  } | null;
  if (!row) return null;

  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;

  return {
    id: row.id,
    vin_code_normalized: row.vin_code_normalized,
    expires_at: row.expires_at,
    scope: scopeFromRow(row.scope_type, row.scope_months),
    scopeFromIso: row.scope_from,
  };
}
