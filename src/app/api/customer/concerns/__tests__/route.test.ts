/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/customer/concerns — resolveSourceContext() の各発生源の解決を検証する。
 *
 * 回帰対象 (/code-review 指摘, 2026-08-31): body_repair_tracking は
 * `customer_concerns.job_id`（reservations(id) への外部キー）に
 * `body_repair_jobs` 自身の主キー（無関係な別テーブルのUUID）を渡しており、
 * reservation_id が存在しない限り外部キー違反でINSERT自体が失敗していた。
 *
 * 追加の回帰対象 (Codex指摘, 2026-08-31): 上記修正後も certificate_id を
 * 読んでいなかったため、reservation_id が無く certificate_id だけ持つ板金
 * ジョブ（bodyRepairJobCreateSchema はどちらも独立して任意）では job_id・
 * certificate_id が両方 null で保存され、Certificate Gate の懸念チェックに
 * 一切引っかからなくなっていた。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  notifySlack: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/slack", () => ({ notifySlack: mocks.notifySlack }));

const TENANT = "tenant-1";
const RESERVATION = "reservation-1";
const BODY_REPAIR_JOB_ID = "body-repair-job-1"; // reservations.id とは無関係な別テーブルの主キー

let tables: Record<string, any>;

vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: (table: string) => {
      if (table === "customer_concerns") {
        return {
          insert: (payload: any) => {
            mocks.insert(payload);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: "concern-1" }, error: null }),
              }),
            };
          },
        };
      }
      const row = tables[table];
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: row ?? null, error: null }) }),
            maybeSingle: () => Promise.resolve({ data: row ?? null, error: null }),
            in: () => ({ maybeSingle: () => Promise.resolve({ data: row ?? null, error: null }) }),
          }),
        }),
      };
    },
  }),
}));

import { POST } from "../route";

function req(body: unknown) {
  return new Request("http://localhost/api/customer/concerns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

beforeEach(() => {
  mocks.checkRateLimit.mockReset().mockResolvedValue(null);
  mocks.notifySlack.mockReset().mockResolvedValue(undefined);
  mocks.insert.mockReset();
  tables = {};
});

describe("POST /api/customer/concerns — body_repair_tracking", () => {
  it("reservation_id を job_id として保存する（body_repair_jobs.id ではない）", async () => {
    tables.body_repair_jobs = { tenant_id: TENANT, reservation_id: RESERVATION, certificate_id: null };

    const res = (await POST(
      req({
        source_type: "body_repair_tracking",
        source_token: "track-token-1",
        concern_text: "塗装の色が違う気がします",
      }),
    )) as Response;

    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload.job_id).toBe(RESERVATION);
    expect(payload.job_id).not.toBe(BODY_REPAIR_JOB_ID);
    expect(payload.tenant_id).toBe(TENANT);
  });

  it("reservation_id が無い板金ジョブは job_id なしで保存する（外部キー違反にしない）", async () => {
    tables.body_repair_jobs = { tenant_id: TENANT, reservation_id: null, certificate_id: null };

    const res = (await POST(
      req({
        source_type: "body_repair_tracking",
        source_token: "track-token-2",
        concern_text: "進捗が止まっている気がします",
      }),
    )) as Response;

    expect(res.status).toBe(201);
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload.job_id).toBeNull();
  });

  it("reservation_id が無くても certificate_id があれば certificate_id を保存する", async () => {
    const CERT = "certificate-1";
    tables.body_repair_jobs = { tenant_id: TENANT, reservation_id: null, certificate_id: CERT };

    const res = (await POST(
      req({
        source_type: "body_repair_tracking",
        source_token: "track-token-3",
        concern_text: "仕上がりが気になります",
      }),
    )) as Response;

    expect(res.status).toBe(201);
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload.job_id).toBeNull();
    expect(payload.certificate_id).toBe(CERT);
  });

  it("トークンに一致する板金ジョブが無ければ 404", async () => {
    tables.body_repair_jobs = null;
    const res = (await POST(
      req({ source_type: "body_repair_tracking", source_token: "missing", concern_text: "text" }),
    )) as Response;
    expect(res.status).toBe(404);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/customer/concerns — parts_confirmation（既存の正しい経路、回帰確認）", () => {
  it("installation_id 経由で reservation_id を job_id として保存する", async () => {
    tables.part_confirmation_signatures = { tenant_id: TENANT, installation_id: "install-1" };
    tables.part_installations = { reservation_id: RESERVATION };

    const res = (await POST(
      req({ source_type: "parts_confirmation", source_token: "pc-token", concern_text: "部品が違う気がします" }),
    )) as Response;

    expect(res.status).toBe(201);
    const payload = mocks.insert.mock.calls[0][0];
    expect(payload.job_id).toBe(RESERVATION);
  });
});
