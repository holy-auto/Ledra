/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 評価依頼（IMP-029 rating_request）の日数計算・送信対象の絞り込み・二重送信防止。
 * 実 DB は使わず fakeSupabaseAdmin（issueHooksPartsAndLine.test.ts と同方針）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("@/lib/notifications/dispatch", () => ({ dispatchNotification: (...a: any[]) => m.dispatch(...a) }));

import {
  RATING_REQUEST_DELAY_DAYS,
  processRatingRequests,
  queueRatingRequest,
  ratingRequestSendAfter,
} from "../ratingRequests";
import { emptyStore, makeFakeAdmin } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";

const NOW = new Date("2026-09-27T00:00:00Z");
const SHOPS = new Map([["t1", "HOLY施工店"]]);

function pending(id: string, over: Record<string, any> = {}) {
  return {
    id,
    tenant_id: "t1",
    certificate_id: `cert-${id}`,
    customer_id: `cust-${id}`,
    token: `tok-${id}`,
    sent_at: null,
    ...over,
  };
}

describe("ratingRequestSendAfter", () => {
  it("発行の7日後（うるう年・月跨ぎでもミリ秒で加算）", () => {
    expect(RATING_REQUEST_DELAY_DAYS).toBe(7);
    // 2028-02-25 + 7日 = 2028-03-03（2028 はうるう年で 2/29 がある: 26,27,28,29,1,2,3）
    expect(ratingRequestSendAfter(new Date("2028-02-25T10:00:00Z")).toISOString()).toBe("2028-03-03T10:00:00.000Z");
  });
});

describe("queueRatingRequest", () => {
  it("send_after = 発行 + 7日 で1行予約する", async () => {
    const store = emptyStore({});
    await queueRatingRequest(makeFakeAdmin(store), {
      tenantId: "t1",
      certificateId: "c1",
      customerId: "cu1",
      issuedAt: new Date("2026-09-27T03:00:00Z"),
    });
    expect(store.inserts).toHaveLength(1);
    expect(store.inserts[0].payload).toMatchObject({
      tenant_id: "t1",
      certificate_id: "c1",
      customer_id: "cu1",
      send_after: "2026-10-04T03:00:00.000Z",
    });
    expect(typeof store.inserts[0].payload.token).toBe("string");
  });

  it("予約済み（UNIQUE 違反 23505）は無視し、それ以外のエラーは投げる", async () => {
    const adminWith = (code: string) =>
      ({ from: () => ({ insert: async () => ({ error: { code, message: code } }) }) }) as any;
    const p = { tenantId: "t1", certificateId: "c1", customerId: "cu1" };
    await expect(queueRatingRequest(adminWith("23505"), p)).resolves.toBeUndefined();
    await expect(queueRatingRequest(adminWith("42501"), p)).rejects.toThrow("42501");
  });
});

describe("processRatingRequests", () => {
  beforeEach(() => m.dispatch.mockClear());

  function setup() {
    return emptyStore({
      certificate_rating_requests: [
        pending("ok"),
        pending("void"),
        pending("optout"),
        pending("already", { sent_at: "2026-09-20T00:00:00Z" }),
        pending("othertenant", { tenant_id: "t2" }),
        pending("nocust", { customer_id: null }),
      ],
      certificates: [
        { id: "cert-ok", status: "active" },
        { id: "cert-void", status: "void" },
        { id: "cert-optout", status: "active" },
        { id: "cert-already", status: "active" },
        { id: "cert-othertenant", status: "active" },
      ],
      customers: [
        { id: "cust-ok", name: "山田", followup_opt_out: false },
        { id: "cust-void", name: null, followup_opt_out: false },
        { id: "cust-optout", name: null, followup_opt_out: true },
        { id: "cust-othertenant", name: null, followup_opt_out: false },
      ],
    });
  }

  it("対象テナント・active・未送信・opt-out でない行だけ、顧客宛 rating_request を送る", async () => {
    const store = setup();
    const sent = await processRatingRequests(makeFakeAdmin(store), NOW, SHOPS);
    expect(sent).toBe(1);
    expect(m.dispatch).toHaveBeenCalledTimes(1);
    expect(m.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        type: "rating_request",
        customerId: "cust-ok",
        linkPath: "/rate/tok-ok",
      }),
    );
    const ok = store.tables.certificate_rating_requests.find((r) => r.id === "ok");
    expect(ok?.sent_at).toBe(NOW.toISOString());
    // 送らなかった行は未送信のまま（void / opt-out を「送った」扱いにしない）
    expect(store.tables.certificate_rating_requests.find((r) => r.id === "void")?.sent_at).toBeNull();
  });

  it("2回目の実行では再送しない（sent_at 条件付き更新で取れた行だけ送る）", async () => {
    const store = setup();
    const admin = makeFakeAdmin(store);
    await processRatingRequests(admin, NOW, SHOPS);
    m.dispatch.mockClear();
    expect(await processRatingRequests(admin, NOW, SHOPS)).toBe(0);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("別プロセスが先に取った行（claim で0件）は送らない", async () => {
    const store = setup();
    const admin = makeFakeAdmin(store);
    const realFrom = admin.from;
    admin.from = (t: string) => {
      const b = realFrom(t);
      if (t !== "certificate_rating_requests") return b;
      const realUpdate = b.update;
      b.update = (payload: any) => {
        // select で読んだ直後に他プロセスが sent_at を立てた状況
        for (const r of store.tables.certificate_rating_requests) r.sent_at ??= "2026-09-26T23:59:59Z";
        return realUpdate(payload);
      };
      return b;
    };
    expect(await processRatingRequests(admin, NOW, SHOPS)).toBe(0);
    expect(m.dispatch).not.toHaveBeenCalled();
  });

  it("送信対象テナントが無ければ何も引かない", async () => {
    const admin = { from: vi.fn() } as any;
    expect(await processRatingRequests(admin, NOW, new Map())).toBe(0);
    expect(admin.from).not.toHaveBeenCalled();
  });
});
