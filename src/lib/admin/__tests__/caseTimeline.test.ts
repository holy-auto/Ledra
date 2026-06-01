import { describe, it, expect } from "vitest";
import { buildCaseTimeline } from "@/lib/admin/caseTimeline";

const keys = ["reservation", "work", "certificate", "invoice", "follow_up"];

describe("buildCaseTimeline", () => {
  it("always returns the five chain steps in order", () => {
    const steps = buildCaseTimeline({ reservation: { status: "confirmed" } });
    expect(steps.map((s) => s.key)).toEqual(keys);
  });

  it("a fresh confirmed reservation: 予約 done, 施工 pending, rest pending", () => {
    const steps = buildCaseTimeline({ reservation: { status: "confirmed" } });
    expect(steps[0].state).toBe("done"); // 予約
    expect(steps[1].state).toBe("pending"); // 施工
    expect(steps[2].state).toBe("pending"); // 証明書
    expect(steps[3].state).toBe("pending"); // 請求
    expect(steps[4].state).toBe("pending"); // フォロー
  });

  it("in_progress reservation marks 施工 as current", () => {
    const steps = buildCaseTimeline({ reservation: { status: "in_progress" } });
    expect(steps[1]).toMatchObject({ key: "work", state: "current", detail: "作業中" });
  });

  it("completed + draft cert: 施工 done, 証明書 current(発行待ち)", () => {
    const steps = buildCaseTimeline({
      reservation: { status: "completed" },
      certificate: { public_id: "C1", status: "draft" },
    });
    expect(steps[1].state).toBe("done");
    expect(steps[2]).toMatchObject({ state: "current", detail: "下書き（発行待ち）", href: "/admin/certificates" });
  });

  it("full happy path: everything done", () => {
    const steps = buildCaseTimeline({
      reservation: { status: "completed" },
      certificate: { public_id: "C1", status: "active" },
      invoice: { id: "d1", status: "paid" },
      followUp: { status: "sent" },
    });
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });

  it("cancelled reservation skips 予約 and 施工", () => {
    const steps = buildCaseTimeline({ reservation: { status: "cancelled" } });
    expect(steps[0]).toMatchObject({ key: "reservation", state: "skipped", detail: "キャンセル" });
    expect(steps[1]).toMatchObject({ key: "work", state: "skipped" });
  });

  it("invoice states map correctly", () => {
    const sent = buildCaseTimeline({ reservation: { status: "completed" }, invoice: { id: "d", status: "sent" } });
    expect(sent[3]).toMatchObject({ state: "current", detail: "送付済み（入金待ち）" });
    const overdue = buildCaseTimeline({
      reservation: { status: "completed" },
      invoice: { id: "d", status: "overdue" },
    });
    expect(overdue[3].detail).toBe("送付済み（期限超過）");
  });

  it("follow-up queued is current, sent is done", () => {
    const queued = buildCaseTimeline({ reservation: { status: "completed" }, followUp: { status: "queued" } });
    expect(queued[4]).toMatchObject({ state: "current", detail: "送信予約済み" });
  });
});
