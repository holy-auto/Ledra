import { describe, it, expect, vi } from "vitest";
import { recordInvoicePaymentBalance } from "@/lib/invoice/recordPayment";

/**
 * recordInvoicePaymentBalance の冪等性 (二重計上の防止) を検証する。
 * payment_entries の select / insert と documents の customer_id 引きをモックする。
 */
function makeSupabase(opts: {
  existing: Array<{ amount: number; reference_no: string | null }>;
  customerId?: string | null;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      if (table === "payment_entries") {
        return {
          // select(...).eq().eq() → Promise<{data,error}>
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.existing, error: null }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "documents") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { customer_id: opts.customerId ?? null }, error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase: supabase as never, inserts };
}

const base = {
  tenantId: "t1",
  documentId: "d1",
  paymentMethod: "credit_card" as const,
  paymentDate: "2026-06-30",
};

describe("recordInvoicePaymentBalance", () => {
  it("records the full total when there are no existing entries", async () => {
    const { supabase, inserts } = makeSupabase({ existing: [], customerId: "c1" });
    const res = await recordInvoicePaymentBalance(supabase, { ...base, total: 165000 });
    expect(res).toEqual({ recorded: true, amount: 165000 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({ amount: 165000, document_id: "d1", tenant_id: "t1", customer_id: "c1" });
  });

  it("records only the remaining balance when partial payments exist", async () => {
    const { supabase, inserts } = makeSupabase({ existing: [{ amount: 50000, reference_no: null }] });
    const res = await recordInvoicePaymentBalance(supabase, { ...base, total: 165000, customerId: "c9" });
    expect(res).toEqual({ recorded: true, amount: 115000 });
    expect(inserts[0]).toMatchObject({ amount: 115000 });
  });

  it("is a no-op when the invoice is already fully paid (remaining <= 0)", async () => {
    const { supabase, inserts } = makeSupabase({ existing: [{ amount: 165000, reference_no: null }] });
    const res = await recordInvoicePaymentBalance(supabase, { ...base, total: 165000, customerId: "c1" });
    expect(res).toEqual({ recorded: false, amount: 0 });
    expect(inserts).toHaveLength(0);
  });

  it("is a no-op when an entry with the same reference_no already exists (webhook retry)", async () => {
    const { supabase, inserts } = makeSupabase({ existing: [{ amount: 165000, reference_no: "pi_123" }] });
    const res = await recordInvoicePaymentBalance(supabase, {
      ...base,
      total: 165000,
      customerId: "c1",
      referenceNo: "pi_123",
    });
    expect(res).toEqual({ recorded: false, amount: 0 });
    expect(inserts).toHaveLength(0);
  });
});
