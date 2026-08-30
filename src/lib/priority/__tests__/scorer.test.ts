import { describe, it, expect } from "vitest";
import { scoreTile, scoreJobSuggestion, scoreCustomerAction, scoreBoothSignal, scoreAndRank } from "../scorer";
import type { TaskTile } from "@/lib/admin/todayTasks";
import type { JobNextActionSuggestion } from "@/lib/ai/jobNextAction";
import type { NextAction } from "@/lib/customers/signals";
import type { BoothSignal } from "@/lib/booths/boothSignals";

// ── ヘルパ ──

const mkTile = (overrides?: Partial<TaskTile>): TaskTile => ({
  id: "overdue_invoices",
  label: "期限超過の請求",
  count: 3,
  hint: "合計 ¥150,000 が未回収です",
  href: "/admin/invoices",
  tone: "urgent",
  priority: 0,
  ...overrides,
});

const mkJobSuggestion = (overrides?: Partial<JobNextActionSuggestion>): JobNextActionSuggestion => ({
  action: "follow_up_overdue",
  message: "期限超過の請求があります。",
  priority: "high",
  ai: false,
  ...overrides,
});

const mkCustomerAction = (overrides?: Partial<NextAction>): NextAction => ({
  id: "review_overdue_invoice",
  label: "期限超過の請求書を確認",
  reason: "3 件が期限超過",
  cta: { href: "/admin/customers/c1?tab=invoices", text: "請求タブを開く" },
  priority: "high",
  ...overrides,
});

const mkBoothSignal = (overrides?: Partial<BoothSignal>): BoothSignal => ({
  kind: "capacity_exceeded",
  boothId: "b1",
  boothName: "ブースA",
  reservationIds: ["r1"],
  message: "ブースAが3/2台で定員超過です。",
  priority: "high",
  ...overrides,
});

// ── scoreTile ──

describe("scoreTile", () => {
  it("priority 0 (urgent) → スコア 90+", () => {
    const result = scoreTile(mkTile({ priority: 0, count: 1 }));
    expect(result.score).toBe(90);
    expect(result.source).toBe("dashboard");
    expect(result.actionKey).toBe("dashboard:overdue_invoices");
  });

  it("priority 3 (low) → スコア 30+", () => {
    const result = scoreTile(mkTile({ priority: 3, count: 1 }));
    expect(result.score).toBe(30);
  });

  it("count が多いとボーナス（最大 +10）", () => {
    const low = scoreTile(mkTile({ count: 1 }));
    const high = scoreTile(mkTile({ count: 30 }));
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.score).toBeLessThanOrEqual(100);
  });
});

// ── scoreJobSuggestion ──

describe("scoreJobSuggestion", () => {
  it("high → 85", () => {
    const result = scoreJobSuggestion(mkJobSuggestion({ priority: "high" }), "res-1");
    expect(result.score).toBe(85);
    expect(result.source).toBe("job");
    expect(result.entityId).toBe("res-1");
  });

  it("med → 60", () => {
    const result = scoreJobSuggestion(mkJobSuggestion({ priority: "med" }), "res-1");
    expect(result.score).toBe(60);
  });

  it("low → 35", () => {
    const result = scoreJobSuggestion(mkJobSuggestion({ priority: "low" }), "res-1");
    expect(result.score).toBe(35);
  });

  it("actionKey に reservationId と action を含む", () => {
    const result = scoreJobSuggestion(mkJobSuggestion({ action: "start_work" }), "res-99");
    expect(result.actionKey).toBe("job:res-99:start_work");
  });
});

// ── scoreCustomerAction ──

describe("scoreCustomerAction", () => {
  it("high → 80", () => {
    const result = scoreCustomerAction(mkCustomerAction({ priority: "high" }), "c1");
    expect(result.score).toBe(80);
    expect(result.source).toBe("customer");
  });

  it("medium → 55", () => {
    const result = scoreCustomerAction(mkCustomerAction({ priority: "medium" }), "c1");
    expect(result.score).toBe(55);
  });

  it("low → 30", () => {
    const result = scoreCustomerAction(mkCustomerAction({ priority: "low" }), "c1");
    expect(result.score).toBe(30);
  });
});

// ── scoreBoothSignal ──

describe("scoreBoothSignal", () => {
  it("high → 88（ブースは安全直結なので job より高め）", () => {
    const result = scoreBoothSignal(mkBoothSignal({ priority: "high" }));
    expect(result.score).toBe(88);
    expect(result.source).toBe("booth");
  });

  it("boothId null → actionKey に 'unassigned'", () => {
    const result = scoreBoothSignal(mkBoothSignal({ boothId: null, kind: "assign_booth", reservationIds: ["r1"] }));
    expect(result.actionKey).toBe("booth:unassigned:assign_booth:r1");
  });

  it("同じブース・同じ kind でも reservationIds が異なれば actionKey が異なる（複数ウィンドウの重複排除誤爆防止）", () => {
    const morning = scoreBoothSignal(mkBoothSignal({ reservationIds: ["r1", "r2"] }));
    const evening = scoreBoothSignal(mkBoothSignal({ reservationIds: ["r3", "r4"] }));
    expect(morning.actionKey).not.toBe(evening.actionKey);
  });
});

// ── scoreAndRank ──

describe("scoreAndRank", () => {
  it("全ソースを統合してスコア降順", () => {
    const result = scoreAndRank({
      tiles: [mkTile({ priority: 0, count: 1 })],
      jobSuggestions: [{ reservationId: "r1", suggestion: mkJobSuggestion({ priority: "low" }) }],
      customerActions: [{ customerId: "c1", action: mkCustomerAction({ priority: "medium" }) }],
      boothSignals: [mkBoothSignal({ priority: "med" })],
    });

    expect(result.length).toBe(4);
    // スコア降順であること
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
    // ソース多様性
    const sources = new Set(result.map((a) => a.source));
    expect(sources.size).toBe(4);
  });

  it("同一 actionKey は最高スコアを採用（重複排除）", () => {
    // 同じタイルを2回渡す（本来あり得ないが dedup テスト）
    const result = scoreAndRank({
      tiles: [
        mkTile({ id: "overdue_invoices", priority: 0, count: 1 }),
        mkTile({ id: "overdue_invoices", priority: 2, count: 1 }),
      ],
    });

    expect(result.length).toBe(1);
    expect(result[0].score).toBe(90); // priority 0 のスコアが勝つ
  });

  it("limit で上位 N 件に絞れる", () => {
    const result = scoreAndRank(
      {
        tiles: [
          mkTile({ id: "in_progress_jobs", priority: 0, count: 2 }),
          mkTile({ id: "overdue_invoices", priority: 0, count: 1 }),
          mkTile({ id: "today_visits", priority: 1, count: 5 }),
          mkTile({ id: "unpaid_invoices", priority: 2, count: 1 }),
        ],
      },
      2,
    );

    expect(result.length).toBe(2);
    expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
  });

  it("空入力 → 空配列", () => {
    expect(scoreAndRank({})).toEqual([]);
  });

  it("同じブース・同じ kind の複数ウィンドウ（朝と夕方の定員超過）を両方保持する", () => {
    const result = scoreAndRank({
      boothSignals: [
        mkBoothSignal({ reservationIds: ["morning-1", "morning-2"], message: "朝の定員超過" }),
        mkBoothSignal({ reservationIds: ["evening-1", "evening-2"], message: "夕方の定員超過" }),
      ],
    });
    expect(result).toHaveLength(2);
  });

  it("全 ScoredAction に reason があること（説明可能性）", () => {
    const result = scoreAndRank({
      tiles: [mkTile()],
      jobSuggestions: [{ reservationId: "r1", suggestion: mkJobSuggestion() }],
      customerActions: [{ customerId: "c1", action: mkCustomerAction() }],
      boothSignals: [mkBoothSignal()],
    });

    for (const a of result) {
      expect(a.reason).toBeTruthy();
      expect(a.label).toBeTruthy();
    }
  });
});
