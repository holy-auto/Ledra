/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * maybeNotifyBodyRepairStageAdvance: opt-in / 顧客 LINE 連携 / 進捗マッピングを検証する。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BODY_REPAIR_STAGES, BODY_REPAIR_STAGE_LABEL } from "@/lib/validations/body-repair-job";

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  resolveAction: vi.fn(),
  sendProgress: vi.fn(),
  customerRow: { data: null as any },
  tenantRow: { data: { name: "テスト鈑金" } as any },
}));

vi.mock("@/lib/ai/automation/policy", () => ({
  loadAiAutomationSettings: mocks.loadSettings,
  resolveAutoAction: mocks.resolveAction,
}));
vi.mock("@/lib/line/client", () => ({ sendProgressUpdate: mocks.sendProgress }));
vi.mock("@/lib/bodyRepair/trackToken", () => ({
  ensureBodyRepairTrackToken: vi.fn().mockResolvedValue("tok123"),
  TRACK_BASE_PATH: "/track",
}));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => {
    let table = "";
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve(table === "customers" ? mocks.customerRow : mocks.tenantRow),
    };
    return { admin: { from: (t: string) => ((table = t), builder) } };
  },
}));

import { maybeNotifyBodyRepairStageAdvance } from "../stageNotify";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue({ enabled: true });
  mocks.resolveAction.mockReturnValue(true);
  mocks.sendProgress.mockResolvedValue(true);
  mocks.customerRow.data = { id: "c1", name: "山田太郎", line_user_id: "U123" };
});

describe("maybeNotifyBodyRepairStageAdvance", () => {
  it("does nothing when customerId is null", async () => {
    await maybeNotifyBodyRepairStageAdvance({ tenantId: "t1", jobId: "j1", customerId: null, stage: "paint" });
    expect(mocks.sendProgress).not.toHaveBeenCalled();
  });

  it("does nothing when the action is not opted in", async () => {
    mocks.resolveAction.mockReturnValue(false);
    await maybeNotifyBodyRepairStageAdvance({ tenantId: "t1", jobId: "j1", customerId: "c1", stage: "paint" });
    expect(mocks.sendProgress).not.toHaveBeenCalled();
  });

  it("does nothing when the customer has no line_user_id", async () => {
    mocks.customerRow.data = { id: "c1", name: "山田太郎", line_user_id: null };
    await maybeNotifyBodyRepairStageAdvance({ tenantId: "t1", jobId: "j1", customerId: "c1", stage: "paint" });
    expect(mocks.sendProgress).not.toHaveBeenCalled();
  });

  it("sends a progress update with the mapped stage label and totals", async () => {
    await maybeNotifyBodyRepairStageAdvance({ tenantId: "t1", jobId: "j1", customerId: "c1", stage: "paint" });
    expect(mocks.sendProgress).toHaveBeenCalledTimes(1);
    const arg = mocks.sendProgress.mock.calls[0][0];
    expect(arg.lineUserId).toBe("U123");
    expect(arg.stepLabel).toBe(BODY_REPAIR_STAGE_LABEL.paint);
    expect(arg.totalSteps).toBe(BODY_REPAIR_STAGES.length);
    expect(arg.currentStep).toBe(BODY_REPAIR_STAGES.indexOf("paint") + 1);
    expect(arg.tenantName).toBe("テスト鈑金");
    // 顧客ポータルではなく案件トラッキング (/track/[token]) へリンクすること。
    expect(arg.portalUrl).toContain("/track/tok123");
  });

  it("swallows errors (non-blocking)", async () => {
    mocks.sendProgress.mockRejectedValue(new Error("LINE down"));
    await expect(
      maybeNotifyBodyRepairStageAdvance({ tenantId: "t1", jobId: "j1", customerId: "c1", stage: "complete" }),
    ).resolves.toBeUndefined();
  });
});
