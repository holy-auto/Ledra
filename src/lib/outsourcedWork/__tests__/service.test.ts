/**
 * service.ts の実行経路テスト。Supabase は「テーブル＝配列」の偽クライアントで置き換える。
 * 見たいのは DB の振る舞いではなく、遷移の付随処理（受領試行の採番と accepted 化、
 * 例外承認の1回更新と2イベント、照合イベント経由でしか MATCHED に入れないこと、
 * 完了後再施工の承認が使い回せないこと）。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CallerInfo } from "@/lib/auth/checkRole";

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

const DEFAULTS: Record<string, () => Row> = {
  outsourced_work_requests: () => ({
    status: "REQUEST_CREATED",
    exception_origin_status: null,
    current_receipt_attempt_id: null,
    assigned_worker_user_id: null,
    designated_reviewer_user_ids: [],
    designated_approver_user_ids: [],
    approved_by: null,
    approved_at: null,
    completed_at: null,
    evidence_hash: null,
    evidence_generated_at: null,
    updated_at: "2026-09-18T00:00:00.000Z",
  }),
  outsourced_receipt_attempts: () => ({
    result: "pending",
    started_at: new Date().toISOString(),
    received_by: null,
    received_at: null,
    lines: [],
    comment: null,
    rejected_by: null,
    rejected_at: null,
    rejection_reason: null,
    superseded_by_attempt_id: null,
  }),
  outsourced_work_events: () => ({ payload: {}, reason: null, receipt_attempt_id: null, related_event_id: null }),
  outsourced_supplied_parts: () => ({ prepared_at: null, handed_over_at: null }),
};

let clock = 0;
function fakeFrom(table: string) {
  tables[table] ??= [];
  const st = {
    op: "select" as "select" | "insert" | "update",
    filters: [] as ((r: Row) => boolean)[],
    payload: null as unknown,
    head: false,
    order: null as { k: string; asc: boolean } | null,
    limit: null as number | null,
    single: false,
    maybe: false,
  };
  const rows = () => tables[table].filter((r) => st.filters.every((f) => f(r)));
  const exec = () => {
    let data: unknown = null;
    let error: { code?: string; message: string } | null = null;
    let count: number | null = null;
    if (st.op === "insert") {
      const arr = (Array.isArray(st.payload) ? st.payload : [st.payload]) as Row[];
      const inserted: Row[] = [];
      for (const p of arr) {
        const r: Row = {
          id: crypto.randomUUID(),
          created_at: new Date(Date.UTC(2026, 8, 18, 0, 0, ++clock)).toISOString(),
          ...(DEFAULTS[table]?.() ?? {}),
          ...p,
        };
        if (
          table === "outsourced_receipt_attempts" &&
          tables[table].some((x) => x.request_id === r.request_id && x.attempt_no === r.attempt_no)
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key" }, count };
        }
        inserted.push(r);
      }
      tables[table].push(...inserted);
      data = Array.isArray(st.payload) ? inserted : inserted[0];
    } else if (st.op === "update") {
      const target = rows();
      for (const r of target) Object.assign(r, st.payload as Row);
      data = target;
    } else {
      let r = rows();
      if (st.order) {
        const { k, asc } = st.order;
        r = [...r].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (st.limit !== null) r = r.slice(0, st.limit);
      if (st.head) return { data: null, error: null, count: r.length };
      count = r.length;
      data = r;
    }
    if (st.single || st.maybe) {
      data = Array.isArray(data) ? ((data as Row[])[0] ?? null) : data;
      if (st.single && !data) error = { message: "no rows" };
    }
    // 実物の PostgREST は行のコピーを返す。参照を返すと、後の update が呼び出し側の変数を書き換えて
    // 「更新前の状態」が消える（テスト側の偽物の都合で本体の挙動を誤認しないため）
    return { data: data === null ? null : structuredClone(data), error, count };
  };
  const b: Record<string, unknown> = {
    select: (_c?: string, o?: { head?: boolean }) => {
      if (st.op === "select") st.head = !!o?.head;
      return b;
    },
    insert: (p: unknown) => ((st.op = "insert"), (st.payload = p), b),
    update: (p: unknown) => ((st.op = "update"), (st.payload = p), b),
    eq: (k: string, v: unknown) => (st.filters.push((r) => r[k] === v), b),
    is: (k: string, v: unknown) => (st.filters.push((r) => r[k] === v), b),
    in: (k: string, vs: unknown[]) => (st.filters.push((r) => vs.includes(r[k])), b),
    not: (k: string, _o: string, v: unknown) => (st.filters.push((r) => r[k] !== v), b),
    or: (expr: string) => {
      const parts = expr.split(",").map((p) => p.split(".eq."));
      st.filters.push((r) => parts.some(([k, v]) => r[k] === v));
      return b;
    },
    order: (k: string, o?: { ascending?: boolean }) => ((st.order = { k, asc: o?.ascending !== false }), b),
    limit: (n: number) => ((st.limit = n), b),
    maybeSingle: () => ((st.maybe = true), b),
    single: () => ((st.single = true), b),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(exec()).then(res, rej),
  };
  return b;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => ({ from: fakeFrom }) }));
vi.mock("@/lib/audit/tenantLog", () => ({ logTenantAuditEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/anchoring/providers/polygon", () => ({
  anchorToPolygon: vi.fn(async () => ({ txHash: null, anchored: false, network: null })),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { createWorkRequest, generateEvidence, recordWorkEvent, transitionWorkRequest } from "../service";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const CONTRACTOR = "22222222-2222-4222-8222-222222222222";
const clientAdmin: CallerInfo = {
  userId: "u-client-admin",
  tenantId: CLIENT,
  role: "admin",
  planTier: "free" as never,
};
const clientStaff: CallerInfo = {
  userId: "u-client-staff",
  tenantId: CLIENT,
  role: "staff",
  planTier: "free" as never,
};
const worker: CallerInfo = { userId: "u-worker", tenantId: CONTRACTOR, role: "staff", planTier: "free" as never };
const contractorAdmin: CallerInfo = {
  userId: "u-c-admin",
  tenantId: CONTRACTOR,
  role: "admin",
  planTier: "free" as never,
};
const reviewerAsViewer: CallerInfo = {
  userId: "u-reviewer",
  tenantId: CLIENT,
  role: "viewer",
  planTier: "free" as never,
};

function seedRequest(status = "REQUEST_CREATED", extra: Row = {}) {
  const id = crypto.randomUUID();
  tables.outsourced_work_requests.push({
    id,
    client_tenant_id: CLIENT,
    contractor_tenant_id: CONTRACTOR,
    client_store_id: null,
    vehicle_id: null,
    vin: "JMBXXXX",
    vehicle_label: "テスト車",
    work_description: "ETC 取付",
    due_date: "2026-10-01",
    order_number: null,
    customer_note: null,
    comment: null,
    created_by: clientAdmin.userId,
    created_at: "2026-09-18T00:00:00.000Z",
    ...DEFAULTS.outsourced_work_requests(),
    designated_reviewer_user_ids: [reviewerAsViewer.userId],
    status,
    ...extra,
  });
  tables.outsourced_supplied_parts.push({
    id: crypto.randomUUID(),
    request_id: id,
    part_number: "P-1",
    part_name: "ETC 本体",
    quantity: 1,
    created_at: "2026-09-18T00:00:00.000Z",
    ...DEFAULTS.outsourced_supplied_parts(),
  });
  return id;
}
const req = (id: string) => tables.outsourced_work_requests.find((r) => r.id === id)!;
const events = (id: string) => tables.outsourced_work_events.filter((e) => e.request_id === id);
const attempts = (id: string) => tables.outsourced_receipt_attempts.filter((a) => a.request_id === id);
const go = (caller: CallerInfo, id: string, to: string, extra: Record<string, unknown> = {}) =>
  transitionWorkRequest(caller, id, { to: to as never, reason: null, return_to: null, payload: {}, ...extra });
const WORK_DONE = {
  used_parts: [{ part_number: "P-1", quantity: 1 }],
  before_photo_paths: [],
  after_photo_paths: [],
  signature: "施工 太郎",
};

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const t of [
    "outsourced_work_requests",
    "outsourced_supplied_parts",
    "outsourced_receipt_attempts",
    "outsourced_work_events",
    "tenant_memberships",
    "staff_members",
    "tenants",
    "stores",
    "vehicles",
  ])
    tables[t] = [];
  clock = 0;
});

describe("TR-051 通常フロー（受領試行・照合・署名を含む）", () => {
  it("依頼作成 → … → 完了まで通り、受領試行は accepted、イベントが時系列で残る", async () => {
    const id = seedRequest();
    expect((await go(clientAdmin, id, "PARTS_PREPARED")).ok).toBe(true);
    expect((await go(clientStaff, id, "AWAITING_HANDOVER")).ok).toBe(true);
    expect((await go(worker, id, "RECEIPT_IN_REVIEW")).ok).toBe(true);
    expect(attempts(id)).toHaveLength(1);
    expect(req(id).current_receipt_attempt_id).toBe(attempts(id)[0].id);

    // AC-004: 現物ライン無しでは受領済みにできない
    const noLines = await go(worker, id, "RECEIVED");
    expect(noLines.ok).toBe(false);
    const partId = tables.outsourced_supplied_parts[0].id;
    expect(
      (
        await go(worker, id, "RECEIVED", {
          payload: { lines: [{ part_id: partId, received_quantity: 1, actual_part_number: "P-1" }] },
        })
      ).ok,
    ).toBe(true);
    expect(attempts(id)[0].result).toBe("accepted");

    // AC-005: 直接 MATCHED は不可。照合イベント（一致）経由でだけ進む
    const direct = await go(worker, id, "MATCHED", { payload: { verification_result: "MATCH" } });
    expect(direct.ok).toBe(false);
    expect(req(id).status).toBe("RECEIVED");
    const v = await recordWorkEvent(worker, id, { type: "VERIFICATION", result: "MATCH" });
    expect(v.ok).toBe(true);
    expect(req(id).status).toBe("MATCHED");

    expect((await go(worker, id, "READY_FOR_WORK")).ok).toBe(true);
    expect((await go(worker, id, "WORK_IN_PROGRESS")).ok).toBe(true);
    // AC-007: 署名無しでは施工完了にできない
    expect((await go(worker, id, "WORK_COMPLETED")).ok).toBe(false);
    expect((await go(worker, id, "WORK_COMPLETED", { payload: WORK_DONE })).ok).toBe(true);
    expect((await go(clientAdmin, id, "AWAITING_CLIENT_CONFIRMATION")).ok).toBe(true);
    // 確認者（テナントロールは viewer）が完了確認できる（PER-017）
    expect((await go(reviewerAsViewer, id, "COMPLETED")).ok).toBe(true);
    expect(req(id).status).toBe("COMPLETED");
    expect(req(id).completed_at).toBeTruthy();

    const flow = events(id)
      .filter((e) => e.event_type === "STATUS_TRANSITION")
      .map((e) => e.to_status);
    expect(flow).toEqual([
      "PARTS_PREPARED",
      "AWAITING_HANDOVER",
      "RECEIPT_IN_REVIEW",
      "RECEIVED",
      "MATCHED",
      "READY_FOR_WORK",
      "WORK_IN_PROGRESS",
      "WORK_COMPLETED",
      "AWAITING_CLIENT_CONFIRMATION",
      "COMPLETED",
    ]);

    // TR-048: 完了後はどこへも動かせない
    const back = await go(clientAdmin, id, "CANCELED", { reason: "x" });
    expect(back.ok).toBe(false);
    expect(req(id).status).toBe("COMPLETED");

    // AC-026: 証明データ
    const ev = await generateEvidence(clientAdmin, id);
    expect(ev.ok).toBe(true);
    if (ev.ok) expect(ev.data.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(req(id).evidence_hash).toBeTruthy();
  });

  it("施工担当者は依頼を承認できず、拒否は状態を変えない", async () => {
    const id = seedRequest();
    const r = await go(worker, id, "PARTS_PREPARED");
    expect(r.ok).toBe(false);
    expect(req(id).status).toBe("REQUEST_CREATED");
    expect(events(id)).toHaveLength(0);
  });
});

describe("例外承認（TR-018〜031）", () => {
  async function toShortage() {
    const id = seedRequest("AWAITING_HANDOVER", { approved_at: "2026-09-18T00:00:00.000Z" });
    await go(worker, id, "RECEIPT_IN_REVIEW");
    expect((await go(worker, id, "QUANTITY_SHORTAGE", { reason: "1個不足" })).ok).toBe(true);
    expect(req(id).exception_origin_status).toBe("QUANTITY_SHORTAGE");
    expect((await go(worker, id, "EXCEPTION_APPROVAL_PENDING", { reason: "不足分は後日" })).ok).toBe(true);
    return id;
  }

  it("承認は1回の行更新で復帰先まで進み、EXCEPTION_APPROVED は行に残らずイベント2件になる", async () => {
    const id = await toShortage();
    const r = await go(clientAdmin, id, "EXCEPTION_APPROVED", { return_to: "RECEIVED", reason: "不足分は次回" });
    expect(r.ok).toBe(true);
    expect(req(id).status).toBe("RECEIVED");
    expect(req(id).exception_origin_status).toBeNull();
    // 受領試行は pending のまま残らない（TR-022）
    expect(attempts(id)[0].result).toBe("accepted");
    const last2 = events(id).slice(-2);
    expect(last2.map((e) => [e.from_status, e.to_status, e.actor_role])).toEqual([
      ["EXCEPTION_APPROVAL_PENDING", "EXCEPTION_APPROVED", "client_admin"],
      ["EXCEPTION_APPROVED", "RECEIVED", "system"],
    ]);
    expect(last2[1].related_event_id).toBe(last2[0].id);
  });

  it("PER-029: 発生工程で許されない復帰先は拒否され、状態は変わらない", async () => {
    const id = await toShortage();
    const r = await go(clientAdmin, id, "EXCEPTION_APPROVED", {
      return_to: "AWAITING_CLIENT_CONFIRMATION",
      reason: "x",
    });
    expect(r.ok).toBe(false);
    expect(req(id).status).toBe("EXCEPTION_APPROVAL_PENDING");
  });

  it("復帰先が受領確認中なら新しい受領試行が開き、旧試行に後継 ID が付く", async () => {
    const id = await toShortage();
    const first = attempts(id)[0].id;
    expect(
      (await go(clientAdmin, id, "EXCEPTION_APPROVED", { return_to: "RECEIPT_IN_REVIEW", reason: "再送" })).ok,
    ).toBe(true);
    expect(attempts(id)).toHaveLength(2);
    expect(attempts(id)[1].attempt_no).toBe(2);
    expect(attempts(id)[0].superseded_by_attempt_id).toBe(attempts(id)[1].id);
    expect(req(id).current_receipt_attempt_id).not.toBe(first);
  });

  it("却下は原因の例外ステータスへ戻る（TR-027）。指名されていない施工会社管理者は承認できない", async () => {
    const id = await toShortage();
    expect((await go(contractorAdmin, id, "EXCEPTION_APPROVED", { return_to: "RECEIVED", reason: "x" })).ok).toBe(
      false,
    );
    const r = await go(clientAdmin, id, "EXCEPTION_REJECTED", { reason: "不足のまま施工不可" });
    expect(r.ok).toBe(true);
    expect(req(id).status).toBe("QUANTITY_SHORTAGE");
    expect(req(id).exception_origin_status).toBe("QUANTITY_SHORTAGE");
  });

  it("受領拒否後の再受領は同一依頼内の新しい受領試行（AC-014）", async () => {
    const id = seedRequest("AWAITING_HANDOVER");
    await go(worker, id, "RECEIPT_IN_REVIEW");
    expect((await go(worker, id, "RECEIPT_REJECTED", { reason: "x" })).ok).toBe(false); // PER-014
    expect((await go(contractorAdmin, id, "RECEIPT_REJECTED", { reason: "全数破損" })).ok).toBe(true);
    expect(attempts(id)[0].result).toBe("rejected");
    expect((await go(worker, id, "RECEIPT_IN_REVIEW")).ok).toBe(true);
    expect(attempts(id)).toHaveLength(2);
    expect(attempts(id)[0].result).toBe("rejected"); // 上書きされない
  });
});

describe("完了後（TR-049 / TR-050 / AC-021 / AC-024）", () => {
  it("担当者割当は完了後にできず、再施工の記録は承認1件につき1件", async () => {
    const id = seedRequest("COMPLETED", { completed_at: "2026-09-18T01:00:00.000Z" });
    tables.tenant_memberships.push({ id: "m1", tenant_id: CONTRACTOR, user_id: worker.userId });
    expect(
      (
        await recordWorkEvent(contractorAdmin, id, {
          type: "WORKER_ASSIGNED",
          user_id: "33333333-3333-4333-8333-333333333333",
        })
      ).ok,
    ).toBe(false);

    const rec = {
      type: "POST_COMPLETION_REWORK_RECORDED" as const,
      reason: "再施工",
      signature: "施工 太郎",
      used_parts: [],
      before_photo_paths: [],
      after_photo_paths: [],
    };
    expect((await recordWorkEvent(worker, id, rec)).ok).toBe(false); // 申請も承認も無い
    expect(
      (await recordWorkEvent(contractorAdmin, id, { type: "POST_COMPLETION_REWORK_REQUESTED", reason: "剥がれ" })).ok,
    ).toBe(true);
    expect((await recordWorkEvent(worker, id, { type: "POST_COMPLETION_REWORK_APPROVED" })).ok).toBe(false); // PER-019
    expect((await recordWorkEvent(reviewerAsViewer, id, { type: "POST_COMPLETION_REWORK_APPROVED" })).ok).toBe(true);
    expect((await recordWorkEvent(reviewerAsViewer, id, { type: "POST_COMPLETION_REWORK_APPROVED" })).ok).toBe(false); // 二重承認
    expect((await recordWorkEvent(worker, id, rec)).ok).toBe(true);
    expect((await recordWorkEvent(worker, id, rec)).ok).toBe(false); // 承認の使い回し
    expect(req(id).status).toBe("COMPLETED"); // AC-021: 状態は完了のまま
  });
});

describe("作成（AC-001）", () => {
  it("連携済みの施工事業者だけに出せ、他テナントの車両は紐付けられない", async () => {
    tables.tenants.push({ id: CONTRACTOR, name: "外注テスト", slug: "c" });
    tables.staff_members.push({ id: "s1", tenant_id: CLIENT, linked_tenant_id: CONTRACTOR, is_active: true });
    tables.vehicles.push({ id: "44444444-4444-4444-8444-444444444444", tenant_id: "other" });
    const base = {
      contractor_tenant_id: CONTRACTOR,
      vin: "JMB1",
      work_description: "x",
      designated_reviewer_user_ids: [],
      designated_approver_user_ids: [],
      parts: [],
    };
    expect(
      (await createWorkRequest(clientStaff, { ...base, contractor_tenant_id: "55555555-5555-4555-8555-555555555555" }))
        .ok,
    ).toBe(false);
    expect(
      (await createWorkRequest(clientStaff, { ...base, vehicle_id: "44444444-4444-4444-8444-444444444444" })).ok,
    ).toBe(false);
    const ok = await createWorkRequest(clientStaff, {
      ...base,
      parts: [{ part_number: "P", part_name: "N", quantity: 2, photo_paths: [], label_photo_paths: [] }],
    });
    expect(ok.ok).toBe(true);
    expect(tables.outsourced_supplied_parts).toHaveLength(1);
    expect(events(tables.outsourced_work_requests[0].id as string)[0].event_type).toBe("REQUEST_CREATED");
  });
});
