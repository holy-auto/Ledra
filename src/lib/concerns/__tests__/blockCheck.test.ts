import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasUnresolvedConcerns } from "../blockCheck";

type QueryResult = { count: number | null; error: { message: string } | null };

/** Chained Supabase builder mock: select/eq/in chain, `.or()` resolves the query. */
function chainable(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.or = vi.fn(() => Promise.resolve(result));
  return builder;
}

const fromMock = vi.fn();
const supabase = { from: fromMock } as unknown as SupabaseClient;

describe("hasUnresolvedConcerns", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns false without querying when neither jobId nor certificateId given", async () => {
    const result = await hasUnresolvedConcerns(supabase, "tenant-1", {});
    expect(result).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns true when an unresolved concern exists", async () => {
    const builder = chainable({ count: 1, error: null });
    fromMock.mockReturnValue(builder);
    const result = await hasUnresolvedConcerns(supabase, "tenant-1", { jobId: "job-1" });
    expect(result).toBe(true);
  });

  it("returns false when count is zero", async () => {
    const builder = chainable({ count: 0, error: null });
    fromMock.mockReturnValue(builder);
    const result = await hasUnresolvedConcerns(supabase, "tenant-1", { jobId: "job-1" });
    expect(result).toBe(false);
  });

  it("fails closed (returns true) when the query errors", async () => {
    const builder = chainable({ count: null, error: { message: "boom" } });
    fromMock.mockReturnValue(builder);
    const result = await hasUnresolvedConcerns(supabase, "tenant-1", { jobId: "job-1" });
    expect(result).toBe(true);
  });

  it("scopes the query by tenant_id", async () => {
    const builder = chainable({ count: 0, error: null });
    fromMock.mockReturnValue(builder);
    await hasUnresolvedConcerns(supabase, "tenant-1", { jobId: "job-1" });
    expect(builder.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
  });

  it("ORs job_id and certificate_id when both are given (not AND)", async () => {
    const builder = chainable({ count: 0, error: null });
    fromMock.mockReturnValue(builder);
    await hasUnresolvedConcerns(supabase, "tenant-1", { jobId: "job-1", certificateId: "cert-1" });
    expect(builder.or).toHaveBeenCalledWith("job_id.eq.job-1,certificate_id.eq.cert-1");
  });

  it("builds an OR clause with only job_id when certificateId is absent", async () => {
    const builder = chainable({ count: 0, error: null });
    fromMock.mockReturnValue(builder);
    await hasUnresolvedConcerns(supabase, "tenant-1", { jobId: "job-1" });
    expect(builder.or).toHaveBeenCalledWith("job_id.eq.job-1");
  });
});
