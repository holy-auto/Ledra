import { createServiceRoleAdmin } from "@/lib/supabase/admin";

/** What records a purchase discloses. */
export type ReportScope = { type: "full" } | { type: "recent_months"; months: number };

export type ReportTier = {
  tier_key: string;
  label: string;
  description: string | null;
  price_jpy: number;
  scope: ReportScope;
  sort_order: number;
};

/** Build a scope from the persisted (scope_type, scope_months) pair. */
export function scopeFromRow(scopeType: string | null, scopeMonths: number | null): ReportScope {
  if (scopeType === "recent_months" && typeof scopeMonths === "number" && scopeMonths > 0) {
    return { type: "recent_months", months: scopeMonths };
  }
  return { type: "full" };
}

/**
 * The cutoff timestamp (ISO) a `recent_months` scope implies at `nowMs`, or
 * null for `full`. Calendar-month arithmetic (setMonth handles overflow).
 * Pure — nowMs is passed so it is testable.
 */
export function scopeCutoffIso(scope: ReportScope, nowMs: number): string | null {
  if (scope.type === "full") return null;
  const d = new Date(nowMs);
  const day = d.getUTCDate();
  // Subtract months off the 1st to avoid setUTCMonth rolling an overflowing
  // day into the next month (e.g. Mar 31 − 1mo would become Mar 3), then clamp
  // the day to the destination month's last valid date.
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - scope.months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
}

/**
 * Whether a record created at `createdAtMs` is disclosed by `scope` at `nowMs`.
 * The SAME predicate governs both the `/v/[vin]` display filter and the
 * revenue-share proration, so what a buyer sees and what merchants earn from
 * stay identical. Pure.
 */
export function isCreatedAtInScope(createdAtMs: number, scope: ReportScope, nowMs: number): boolean {
  if (scope.type === "full") return true;
  const cutoff = scopeCutoffIso(scope, nowMs);
  return cutoff !== null && createdAtMs >= new Date(cutoff).getTime();
}

type TierRow = {
  tier_key: string;
  label: string;
  description: string | null;
  price_jpy: number;
  scope_type: string;
  scope_months: number | null;
  sort_order: number;
};

function toTier(r: TierRow): ReportTier {
  return {
    tier_key: r.tier_key,
    label: r.label,
    description: r.description,
    price_jpy: r.price_jpy,
    scope: scopeFromRow(r.scope_type, r.scope_months),
    sort_order: r.sort_order,
  };
}

/** Enabled tiers, most-partial/cheapest first (by sort_order). */
export async function getReportTiers(): Promise<ReportTier[]> {
  const admin = createServiceRoleAdmin("vehicle report tiers — platform-wide staged offerings");
  const [tiersRes, settingsRes] = await Promise.all([
    admin
      .from("vehicle_report_tiers")
      .select("tier_key, label, description, price_jpy, scope_type, scope_months, sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true }),
    admin.from("vehicle_report_settings").select("price_jpy").eq("id", 1).maybeSingle(),
  ]);

  // The full-report price stays sourced from `vehicle_report_settings.price_jpy`
  // so the existing platform-admin price screen remains effective; partial
  // tiers use their own row price. A failed settings read must NOT silently fall
  // back to the seeded tier price (that would charge a stale price after an
  // admin change) — throw so the caller surfaces it.
  // A failed tier-catalog read must NOT collapse to an empty catalog (which
  // would falsely report "sales stopped" / reject valid tier checkouts with no
  // error reaching monitoring) — throw so the caller surfaces it.
  if (tiersRes.error) {
    throw new Error(`vehicle report tiers: catalog read failed: ${tiersRes.error.message}`);
  }
  if (settingsRes.error) {
    throw new Error(`vehicle report tiers: settings price read failed: ${settingsRes.error.message}`);
  }
  const fullPrice =
    typeof (settingsRes.data as { price_jpy: number | null } | null)?.price_jpy === "number"
      ? (settingsRes.data as { price_jpy: number }).price_jpy
      : null;

  return ((tiersRes.data ?? []) as TierRow[])
    .map(toTier)
    .map((t) => (t.scope.type === "full" && fullPrice !== null ? { ...t, price_jpy: fullPrice } : t));
}

/** A single enabled tier by key, or null. */
export async function getReportTierByKey(tierKey: string): Promise<ReportTier | null> {
  const tiers = await getReportTiers();
  return tiers.find((t) => t.tier_key === tierKey) ?? null;
}
