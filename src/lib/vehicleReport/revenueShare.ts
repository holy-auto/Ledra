import { createServiceRoleAdmin } from "@/lib/supabase/admin";

type ServiceRoleAdmin = ReturnType<typeof createServiceRoleAdmin>;

/** Default merchant share (bps) when the settings row is missing. 7000 = 70%. */
export const DEFAULT_MERCHANT_SHARE_BPS = 7000;

export type TenantCertCount = { tenantId: string; certCount: number };
export type TenantShare = { tenantId: string; certCount: number; amount: number };
export type RevenueSplit = { pool: number; totalCertCount: number; shares: TenantShare[] };

/**
 * Split a report sale across the施工店 that left records on the VIN,
 * proportional to each tenant's record count.
 *
 * JPY is zero-decimal, so the split is integer-exact:
 *   1. pool = floor(saleAmount * shareBps / 10000)  ← merchant total
 *   2. each tenant gets floor(pool * certCount / totalCertCount)
 *   3. the rounding remainder (pool - Σfloor) is handed out 1 yen at a
 *      time to the largest contributors first (tenantId asc tie-break),
 *      so Σ(shares) === pool exactly — no yen created or lost.
 */
export function splitRevenueByRecordCount(
  saleAmountJpy: number,
  shareBps: number,
  perTenant: TenantCertCount[],
): RevenueSplit {
  const amount = Math.max(0, Math.floor(saleAmountJpy));
  const bps = Math.min(10000, Math.max(0, Math.floor(shareBps)));
  const eligible = perTenant.filter((t) => t.certCount > 0);
  const totalCertCount = eligible.reduce((sum, t) => sum + t.certCount, 0);

  if (totalCertCount === 0 || amount === 0) {
    return { pool: 0, totalCertCount: 0, shares: [] };
  }

  const pool = Math.floor((amount * bps) / 10000);
  const shares: TenantShare[] = eligible.map((t) => ({
    tenantId: t.tenantId,
    certCount: t.certCount,
    amount: Math.floor((pool * t.certCount) / totalCertCount),
  }));

  // remainder < eligible.length, so a single pass over the sorted list
  // is enough. Sorting a copy keeps `shares` in its original order.
  let remainder = pool - shares.reduce((sum, s) => sum + s.amount, 0);
  const byWeight = [...shares].sort(
    (a, b) => b.certCount - a.certCount || (a.tenantId < b.tenantId ? -1 : a.tenantId > b.tenantId ? 1 : 0),
  );
  for (let i = 0; remainder > 0 && i < byWeight.length; i++, remainder--) {
    byWeight[i].amount += 1;
  }

  return { pool, totalCertCount, shares };
}

/**
 * Anchored-record counts per tenant for one VIN, using the exact same
 * definition as the public `/v/[vin]` timeline (`getPassportData`):
 * opt-in vehicles → their certificates → certs with ≥1 anchored image.
 *
 * ponytail: filters via `.in()` on cert ids (O(certs-per-VIN)). Ceiling:
 * one VIN with thousands of certs would bloat the IN list. Upgrade path is
 * a single grouped SQL/RPC count when a passport ever gets that large.
 */
async function getAnchoredCertCountsByTenant(
  admin: ServiceRoleAdmin,
  vin: string,
  cutoffIso: string | null,
  upperIso: string | null,
): Promise<TenantCertCount[]> {
  const { data: vehiclesRaw } = await admin
    .from("vehicles")
    .select("id")
    .eq("vin_code_normalized", vin)
    .eq("passport_opt_out", false);
  const vehicleIds = ((vehiclesRaw ?? []) as { id: string }[]).map((v) => v.id);
  if (!vehicleIds.length) return [];

  // Scope the record set to exactly what THIS purchase disclosed — never pay a
  // shop whose records were not shown. Bounds match the page display:
  //   lower = order `scope_from` (null = full history),
  //   upper = purchase time (records added afterward aren't disclosed/paid).
  let certQuery = admin.from("certificates").select("id, tenant_id").in("vehicle_id", vehicleIds);
  if (cutoffIso) certQuery = certQuery.gte("created_at", cutoffIso);
  if (upperIso) certQuery = certQuery.lte("created_at", upperIso);
  const { data: certsRaw } = await certQuery;
  const certs = (certsRaw ?? []) as { id: string; tenant_id: string }[];
  if (!certs.length) return [];

  const { data: imgsRaw } = await admin
    .from("certificate_images")
    .select("certificate_id")
    .in(
      "certificate_id",
      certs.map((c) => c.id),
    )
    .not("polygon_tx_hash", "is", null);
  const anchoredCertIds = new Set(((imgsRaw ?? []) as { certificate_id: string }[]).map((i) => i.certificate_id));

  const counts = new Map<string, number>();
  for (const c of certs) {
    if (!anchoredCertIds.has(c.id)) continue;
    counts.set(c.tenant_id, (counts.get(c.tenant_id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([tenantId, certCount]) => ({ tenantId, certCount }));
}

/**
 * Book the merchant revenue-share accrual ledger for a paid report order.
 *
 * Idempotent: no-op unless the order is `paid`, and the ledger insert
 * upserts on UNIQUE(order_id, tenant_id) with ignoreDuplicates — so the
 * two paid-order paths (Stripe webhook + unlock fallback) can both call
 * this and never double-book. No money moves here; rows are booked
 * `pending` and settled later via the Stripe Connect transfer path.
 */
export async function recordVehicleReportRevenueShares(orderId: string): Promise<void> {
  const admin = createServiceRoleAdmin(
    "vehicle report revenue share — book merchant accrual on paid order (cross-tenant)",
  );

  const { data: orderRaw } = await admin
    .from("vehicle_report_orders")
    .select("id, vin_code_normalized, status, amount_jpy, scope_from, created_at")
    .eq("id", orderId)
    .maybeSingle();
  const order = orderRaw as {
    id: string;
    vin_code_normalized: string;
    status: string;
    amount_jpy: number;
    scope_from: string | null;
    created_at: string;
  } | null;
  if (!order || order.status !== "paid") return;

  const vin = order.vin_code_normalized;

  const { data: settingsRaw } = await admin
    .from("vehicle_report_settings")
    .select("merchant_share_bps")
    .eq("id", 1)
    .maybeSingle();
  const shareBps =
    typeof (settingsRaw as { merchant_share_bps: number | null } | null)?.merchant_share_bps === "number"
      ? (settingsRaw as { merchant_share_bps: number }).merchant_share_bps
      : DEFAULT_MERCHANT_SHARE_BPS;

  const perTenant = await getAnchoredCertCountsByTenant(admin, vin, order.scope_from, order.created_at);
  const { pool, totalCertCount, shares } = splitRevenueByRecordCount(order.amount_jpy, shareBps, perTenant);

  if (pool <= 0 || shares.length === 0) {
    console.info("vehicle report revenue share: no eligible merchants / zero pool", {
      orderId,
      vin,
      totalCertCount,
    });
    return;
  }

  const rows = shares.map((s) => ({
    order_id: order.id,
    tenant_id: s.tenantId,
    vin_code_normalized: vin,
    cert_count: s.certCount,
    total_cert_count: totalCertCount,
    sale_amount_jpy: order.amount_jpy,
    share_bps: shareBps,
    amount: s.amount,
    currency: "jpy",
    status: "pending",
  }));

  const { error } = await admin
    .from("vehicle_report_revenue_shares")
    .upsert(rows, { onConflict: "order_id,tenant_id", ignoreDuplicates: true });

  if (error) {
    console.error("vehicle report revenue share: ledger insert failed", { orderId, vin, error });
    return;
  }

  // Close the booking-vs-refund race: a `charge.refunded` handler that ran
  // between our "order is paid" read and this insert would have seen no shares
  // to reverse. Re-check now; if the order was refunded meanwhile, cancel the
  // pending shares we just booked so they can't later be approved/paid for a
  // refunded sale. (Shares are pending here and gated behind manual approval,
  // so this recheck reliably wins before any payout.)
  const { data: freshRaw } = await admin
    .from("vehicle_report_orders")
    .select("status")
    .eq("id", order.id)
    .maybeSingle();
  if ((freshRaw as { status: string } | null)?.status === "refunded") {
    await admin
      .from("vehicle_report_revenue_shares")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", order.id)
      .eq("status", "pending");
    console.info("vehicle report revenue share: order refunded during booking — cancelled", { orderId, vin });
    return;
  }

  console.info("vehicle report revenue share: booked", {
    orderId,
    vin,
    pool,
    tenants: shares.length,
  });
}
