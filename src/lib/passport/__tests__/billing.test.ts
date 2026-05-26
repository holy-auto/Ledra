import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({ getStripeClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({}) },
}));

import { previousMonthRangeUtc, toIsoDate, runBillingForConsumer, runPassportBilling } from "../billing";

describe("previousMonthRangeUtc", () => {
  it("returns the previous calendar month in UTC", () => {
    const r = previousMonthRangeUtc(new Date("2026-05-26T00:00:00Z"));
    expect(toIsoDate(r.start)).toBe("2026-04-01");
    expect(toIsoDate(r.end)).toBe("2026-05-01");
  });

  it("wraps across year boundaries", () => {
    const r = previousMonthRangeUtc(new Date("2026-01-15T00:00:00Z"));
    expect(toIsoDate(r.start)).toBe("2025-12-01");
    expect(toIsoDate(r.end)).toBe("2026-01-01");
  });

  it("uses UTC even when local TZ is JST (no off-by-one)", () => {
    // 2026-05-01 00:30 JST = 2026-04-30 15:30 UTC → previous month should be March
    const r = previousMonthRangeUtc(new Date("2026-04-30T15:30:00Z"));
    expect(toIsoDate(r.start)).toBe("2026-03-01");
    expect(toIsoDate(r.end)).toBe("2026-04-01");
  });
});

// --- runBillingForConsumer --------------------------------------------------

type FakeRow = Record<string, unknown>;

function fakeAdmin({
  callCount,
  onUpsert,
  onUpdate,
}: {
  callCount: number;
  onUpsert?: (doc: FakeRow) => void;
  onUpdate?: (doc: FakeRow) => void;
}) {
  return {
    from: (table: string) => {
      if (table === "passport_api_call_logs") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lt: () => Promise.resolve({ count: callCount, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "passport_api_billing_periods") {
        return {
          upsert: (doc: FakeRow) => {
            onUpsert?.(doc);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "period-1",
                      consumer_id: (doc as { consumer_id: string }).consumer_id,
                      period_start: (doc as { period_start: string }).period_start,
                      period_end: (doc as { period_end: string }).period_end,
                      call_count: (doc as { call_count: number }).call_count,
                      reported_to_stripe_at: null,
                      stripe_usage_record_id: null,
                    },
                    error: null,
                  }),
              }),
            };
          },
          update: (doc: FakeRow) => {
            onUpdate?.(doc);
            return { eq: () => Promise.resolve({ data: null, error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const PERIOD = { start: new Date("2026-04-01T00:00:00Z"), end: new Date("2026-05-01T00:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runBillingForConsumer", () => {
  it("skips inactive consumers without touching Stripe or DB", async () => {
    let upserted = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = fakeAdmin({ callCount: 999, onUpsert: () => (upserted = true) }) as any;
    const stripe = { subscriptionItems: { createUsageRecord: vi.fn() } } as unknown;
    const res = await runBillingForConsumer({
      admin,
      consumer: {
        id: "c1",
        name: "Acme",
        status: "suspended",
        stripe_subscription_item_id: "si_1",
      },
      ...PERIOD,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stripe: stripe as any,
    });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.reason).toBe("inactive");
    expect(upserted).toBe(false);
  });

  it("skips when consumer made zero calls in the period", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = fakeAdmin({ callCount: 0 }) as any;
    const res = await runBillingForConsumer({
      admin,
      consumer: { id: "c1", name: "Acme", status: "active", stripe_subscription_item_id: "si_1" },
      ...PERIOD,
    });
    expect(res.status).toBe("skipped");
    if (res.status === "skipped") expect(res.reason).toBe("no_calls");
  });

  it("records internally but skips Stripe when subscription_item_id is null", async () => {
    let upserted: FakeRow | null = null;
    const admin = fakeAdmin({
      callCount: 42,
      onUpsert: (doc) => (upserted = doc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const stripeCreateUsage = vi.fn();
    const res = await runBillingForConsumer({
      admin,
      consumer: { id: "c1", name: "Acme", status: "active", stripe_subscription_item_id: null },
      ...PERIOD,
      stripe: { subscriptionItems: { createUsageRecord: stripeCreateUsage } } as never,
    });
    expect(res.status).toBe("recorded");
    if (res.status === "recorded") expect(res.callCount).toBe(42);
    expect(stripeCreateUsage).not.toHaveBeenCalled();
    expect(upserted).toMatchObject({ consumer_id: "c1", call_count: 42 });
  });

  it("posts to Stripe with action=set and persists the usage record id", async () => {
    let updated: FakeRow | null = null;
    const admin = fakeAdmin({
      callCount: 17,
      onUpdate: (doc) => (updated = doc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const stripeCreateUsage = vi.fn().mockResolvedValue({ id: "mbur_xyz" });
    const res = await runBillingForConsumer({
      admin,
      consumer: { id: "c1", name: "Acme", status: "active", stripe_subscription_item_id: "si_1" },
      ...PERIOD,
      stripe: { subscriptionItems: { createUsageRecord: stripeCreateUsage } } as never,
    });
    expect(res.status).toBe("reported");
    if (res.status === "reported") {
      expect(res.callCount).toBe(17);
      expect(res.stripeUsageRecordId).toBe("mbur_xyz");
    }
    expect(stripeCreateUsage).toHaveBeenCalledExactlyOnceWith("si_1", {
      quantity: 17,
      action: "set",
      // end - 1s = 2026-04-30T23:59:59Z → unix seconds
      timestamp: Math.floor((PERIOD.end.getTime() - 1000) / 1000),
    });
    expect(updated).toMatchObject({
      stripe_usage_record_id: "mbur_xyz",
      reported_to_stripe_at: expect.any(String),
    });
  });

  it("records the error and returns stripe_failed when the Stripe call throws", async () => {
    let updated: FakeRow | null = null;
    const admin = fakeAdmin({
      callCount: 1,
      onUpdate: (doc) => (updated = doc),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const stripeCreateUsage = vi.fn().mockRejectedValue(new Error("network down"));
    const res = await runBillingForConsumer({
      admin,
      consumer: { id: "c1", name: "Acme", status: "active", stripe_subscription_item_id: "si_1" },
      ...PERIOD,
      stripe: { subscriptionItems: { createUsageRecord: stripeCreateUsage } } as never,
    });
    expect(res.status).toBe("stripe_failed");
    expect(updated).toMatchObject({ last_error: expect.stringContaining("network down") });
  });
});

// --- runPassportBilling -----------------------------------------------------

describe("runPassportBilling", () => {
  it("walks every consumer and aggregates counters", async () => {
    const stripeCreateUsage = vi.fn().mockResolvedValue({ id: "u1" });
    const admin = {
      from: (table: string) => {
        if (table === "passport_api_consumers") {
          return {
            select: () =>
              Promise.resolve({
                data: [
                  { id: "c1", name: "A", status: "active", stripe_subscription_item_id: "si_1" },
                  { id: "c2", name: "B", status: "active", stripe_subscription_item_id: null },
                  { id: "c3", name: "C", status: "suspended", stripe_subscription_item_id: "si_3" },
                ],
                error: null,
              }),
          };
        }
        if (table === "passport_api_call_logs") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                gte: () => ({
                  lt: () => Promise.resolve({ count: val === "c1" ? 5 : val === "c2" ? 3 : 0, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "passport_api_billing_periods") {
          return {
            upsert: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "p",
                      consumer_id: "?",
                      period_start: "2026-04-01",
                      period_end: "2026-05-01",
                      call_count: 0,
                      reported_to_stripe_at: null,
                      stripe_usage_record_id: null,
                    },
                    error: null,
                  }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const r = await runPassportBilling({
      admin,
      ...PERIOD,
      stripe: { subscriptionItems: { createUsageRecord: stripeCreateUsage } } as never,
    });

    expect(r.period_start).toBe("2026-04-01");
    expect(r.period_end).toBe("2026-05-01");
    expect(r.reported_count).toBe(1); // only c1 (active + stripe link + calls > 0)
    expect(r.recorded_count).toBe(1); // c2 (active, no stripe)
    expect(r.skipped_count).toBe(1); // c3 (suspended)
  });
});

// --- End-to-end idempotency with a stateful fake Stripe --------------------

/**
 * The real-world property we care about: re-running the cron for the same
 * month must not bill the customer twice. action="set" gives us this via
 * the Stripe API itself (the latest set wins on the period). Here we
 * simulate it with a stateful fake to prove our integration call matches
 * that contract: two runs → one effective usage record id, second usage
 * quantity equals the latest count.
 */
describe("runPassportBilling — idempotent re-run", () => {
  function makeStatefulStripe() {
    const usageBySubItem = new Map<string, { quantity: number; record_id: string }>();
    let recordCounter = 0;
    return {
      subscriptionItems: {
        createUsageRecord: vi.fn(
          async (siId: string, body: { quantity: number; action: "set" | "increment"; timestamp: number }) => {
            if (body.action === "set") {
              const recordId = `mbur_${++recordCounter}`;
              usageBySubItem.set(siId, { quantity: body.quantity, record_id: recordId });
              return { id: recordId };
            }
            const existing = usageBySubItem.get(siId);
            const nextQty = (existing?.quantity ?? 0) + body.quantity;
            const recordId = `mbur_${++recordCounter}`;
            usageBySubItem.set(siId, { quantity: nextQty, record_id: recordId });
            return { id: recordId };
          },
        ),
      },
      _state: usageBySubItem,
    };
  }

  function makeStatefulAdmin(callCounts: Record<string, number>) {
    // Per-consumer billing-period storage to simulate ON CONFLICT upserts.
    const periodsByKey = new Map<string, FakeRow>();
    return {
      from: (table: string) => {
        if (table === "passport_api_consumers") {
          return {
            select: () =>
              Promise.resolve({
                data: [{ id: "c1", name: "A", status: "active", stripe_subscription_item_id: "si_1" }],
                error: null,
              }),
          };
        }
        if (table === "passport_api_call_logs") {
          return {
            select: () => ({
              eq: (_col: string, consumerId: string) => ({
                gte: () => ({
                  lt: () => Promise.resolve({ count: callCounts[consumerId] ?? 0, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "passport_api_billing_periods") {
          return {
            upsert: (doc: FakeRow) => {
              const key = `${doc.consumer_id}|${doc.period_start}`;
              const existing = periodsByKey.get(key) ?? { id: `period-${periodsByKey.size + 1}` };
              const merged = { ...existing, ...doc };
              periodsByKey.set(key, merged);
              return {
                select: () => ({ single: () => Promise.resolve({ data: merged, error: null }) }),
              };
            },
            update: (doc: FakeRow) => ({
              eq: () => {
                // Merge update into all existing periods (test doesn't
                // care about exact id matching — there's only one).
                for (const [k, v] of periodsByKey.entries()) {
                  periodsByKey.set(k, { ...v, ...doc });
                }
                return Promise.resolve({ data: null, error: null });
              },
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
      _periods: periodsByKey,
    };
  }

  it("second cron run with the same period does NOT double-bill (action=set semantics)", async () => {
    const stripe = makeStatefulStripe();
    const admin = makeStatefulAdmin({ c1: 100 });

    // First run for April
    const r1 = await runPassportBilling({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      ...PERIOD,
      stripe: stripe as never,
    });
    expect(r1.reported_count).toBe(1);

    // Snapshot Stripe state after first run
    expect(stripe._state.get("si_1")?.quantity).toBe(100);

    // Second (accidental / re-trigger) run — same period
    const r2 = await runPassportBilling({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      ...PERIOD,
      stripe: stripe as never,
    });
    expect(r2.reported_count).toBe(1);

    // Stripe still reports 100 (latest set), not 200 — the whole point
    expect(stripe._state.get("si_1")?.quantity).toBe(100);
    expect(stripe.subscriptionItems.createUsageRecord).toHaveBeenCalledTimes(2);
    expect(stripe.subscriptionItems.createUsageRecord).toHaveBeenNthCalledWith(
      1,
      "si_1",
      expect.objectContaining({ action: "set", quantity: 100 }),
    );
    expect(stripe.subscriptionItems.createUsageRecord).toHaveBeenNthCalledWith(
      2,
      "si_1",
      expect.objectContaining({ action: "set", quantity: 100 }),
    );

    // DB period row updated, not duplicated
    expect(admin._periods.size).toBe(1);
  });

  it("re-run reflects new call counts (catch-up after late-arriving logs)", async () => {
    const stripe = makeStatefulStripe();
    const admin = makeStatefulAdmin({ c1: 100 });

    await runPassportBilling({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin as any,
      ...PERIOD,
      stripe: stripe as never,
    });
    expect(stripe._state.get("si_1")?.quantity).toBe(100);

    // New logs land — second run sees 150
    admin._periods.clear(); // reset for clarity; counters are independent
    const admin2 = makeStatefulAdmin({ c1: 150 });
    await runPassportBilling({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin: admin2 as any,
      ...PERIOD,
      stripe: stripe as never,
    });

    expect(stripe._state.get("si_1")?.quantity).toBe(150);
  });
});
