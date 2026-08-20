import { describe, it, expect } from "vitest";
import {
  computeVerifiedRate,
  computeEvidenceSufficiencyRate,
  computeAvgReviewWaitHours,
  computeAvgCycleTimeHours,
  computeSlaComplianceRate,
  computeDailyThroughput,
  computeOperationalKPIs,
  type CertificateStateCounts,
  type JobTimeline,
  type SlaEvaluatedRecord,
} from "../operationalKpi";

// ── computeVerifiedRate ──

describe("computeVerifiedRate", () => {
  it("正常: VERIFIED 3/5 = 60%（NOT_READY は分母から除外）", () => {
    const counts: CertificateStateCounts = {
      NOT_READY: 10,
      READY: 1,
      VERIFIED: 3,
      REVOKED: 1,
    };
    // 分母 = 1+3+1 = 5（NOT_READY 10 は除外）
    expect(computeVerifiedRate(counts)).toBe(60);
  });

  it("全て VERIFIED → 100%", () => {
    expect(computeVerifiedRate({ VERIFIED: 5 })).toBe(100);
  });

  it("VERIFIED なし → 0%", () => {
    expect(computeVerifiedRate({ READY: 3, ISSUING: 2 })).toBe(0);
  });

  it("NOT_READY のみ → null（分母 0）", () => {
    expect(computeVerifiedRate({ NOT_READY: 5 })).toBeNull();
  });

  it("空 → null", () => {
    expect(computeVerifiedRate({})).toBeNull();
  });
});

// ── computeEvidenceSufficiencyRate ──

describe("computeEvidenceSufficiencyRate", () => {
  it("8/10 = 80%", () => {
    expect(computeEvidenceSufficiencyRate({ total: 10, complete: 8 })).toBe(80);
  });

  it("total=0 → null", () => {
    expect(computeEvidenceSufficiencyRate({ total: 0, complete: 0 })).toBeNull();
  });

  it("全完了 → 100%", () => {
    expect(computeEvidenceSufficiencyRate({ total: 5, complete: 5 })).toBe(100);
  });
});

// ── computeAvgReviewWaitHours ──

describe("computeAvgReviewWaitHours", () => {
  const mkTimeline = (overrides?: Partial<JobTimeline>): JobTimeline => ({
    currentState: "VERIFIED",
    scheduledAt: "2026-01-01T09:00:00Z",
    startedAt: "2026-01-01T10:00:00Z",
    completedAt: "2026-01-01T14:00:00Z",
    verifiedAt: "2026-01-01T16:00:00Z", // 2 hours wait
    ...overrides,
  });

  it("平均レビュー待ち時間を算出", () => {
    const timelines = [
      mkTimeline({ completedAt: "2026-01-01T14:00:00Z", verifiedAt: "2026-01-01T16:00:00Z" }), // 2h
      mkTimeline({ completedAt: "2026-01-01T14:00:00Z", verifiedAt: "2026-01-01T18:00:00Z" }), // 4h
    ];
    expect(computeAvgReviewWaitHours(timelines)).toBe(3); // avg(2,4) = 3
  });

  it("completedAt がない行はスキップ", () => {
    const timelines = [
      mkTimeline(), // 2h
      mkTimeline({ completedAt: null }), // skipped
    ];
    expect(computeAvgReviewWaitHours(timelines)).toBe(2);
  });

  it("verifiedAt がない行はスキップ", () => {
    const timelines = [mkTimeline({ verifiedAt: null })];
    expect(computeAvgReviewWaitHours(timelines)).toBeNull();
  });

  it("負値（データ不備）はスキップ", () => {
    const timelines = [mkTimeline({ completedAt: "2026-01-01T18:00:00Z", verifiedAt: "2026-01-01T14:00:00Z" })];
    expect(computeAvgReviewWaitHours(timelines)).toBeNull();
  });

  it("空配列 → null", () => {
    expect(computeAvgReviewWaitHours([])).toBeNull();
  });
});

// ── computeAvgCycleTimeHours ──

describe("computeAvgCycleTimeHours", () => {
  it("SCHEDULED→VERIFIED のサイクルタイム平均", () => {
    const timelines: JobTimeline[] = [
      {
        currentState: "VERIFIED",
        scheduledAt: "2026-01-01T09:00:00Z",
        startedAt: null,
        completedAt: null,
        verifiedAt: "2026-01-01T21:00:00Z", // 12h
      },
      {
        currentState: "VERIFIED",
        scheduledAt: "2026-01-02T09:00:00Z",
        startedAt: null,
        completedAt: null,
        verifiedAt: "2026-01-03T09:00:00Z", // 24h
      },
    ];
    expect(computeAvgCycleTimeHours(timelines)).toBe(18); // avg(12,24)
  });

  it("verifiedAt なし → スキップ", () => {
    const timelines: JobTimeline[] = [
      {
        currentState: "IN_PROGRESS",
        scheduledAt: "2026-01-01T09:00:00Z",
        startedAt: null,
        completedAt: null,
        verifiedAt: null,
      },
    ];
    expect(computeAvgCycleTimeHours(timelines)).toBeNull();
  });
});

// ── computeSlaComplianceRate ──

describe("computeSlaComplianceRate", () => {
  it("全て SLA 内 → 100%", () => {
    const records: SlaEvaluatedRecord[] = [{ stage: null }, { stage: null }, { stage: null }];
    expect(computeSlaComplianceRate(records)).toBe(100);
  });

  it("1/3 が overdue → 66.67%", () => {
    const records: SlaEvaluatedRecord[] = [{ stage: null }, { stage: null }, { stage: "overdue" }];
    expect(computeSlaComplianceRate(records)).toBe(66.67);
  });

  it("全て at_risk → 0%", () => {
    const records: SlaEvaluatedRecord[] = [{ stage: "at_risk" }, { stage: "overdue" }];
    expect(computeSlaComplianceRate(records)).toBe(0);
  });

  it("空 → null", () => {
    expect(computeSlaComplianceRate([])).toBeNull();
  });
});

// ── computeDailyThroughput ──

describe("computeDailyThroughput", () => {
  it("30 件 / 10 日 = 3.0", () => {
    expect(computeDailyThroughput({ completedCount: 30, periodDays: 10 })).toBe(3);
  });

  it("7 件 / 30 日 = 0.2", () => {
    expect(computeDailyThroughput({ completedCount: 7, periodDays: 30 })).toBe(0.2);
  });

  it("periodDays=0 → null", () => {
    expect(computeDailyThroughput({ completedCount: 5, periodDays: 0 })).toBeNull();
  });
});

// ── computeOperationalKPIs ──

describe("computeOperationalKPIs", () => {
  it("全入力あり → 全 KPI を返す", () => {
    const result = computeOperationalKPIs({
      certificateCounts: { VERIFIED: 7, READY: 3 },
      evidenceSufficiency: { total: 10, complete: 9 },
      timelines: [
        {
          currentState: "VERIFIED",
          scheduledAt: "2026-01-01T09:00:00Z",
          startedAt: "2026-01-01T10:00:00Z",
          completedAt: "2026-01-01T14:00:00Z",
          verifiedAt: "2026-01-01T16:00:00Z",
        },
      ],
      slaRecords: [{ stage: null }, { stage: null }, { stage: "at_risk" }],
      throughput: { completedCount: 15, periodDays: 5 },
    });
    expect(result.verifiedRate).toBe(70);
    expect(result.evidenceSufficiencyRate).toBe(90);
    expect(result.avgReviewWaitHours).toBe(2);
    expect(result.avgCycleTimeHours).toBe(7);
    expect(result.slaComplianceRate).toBe(66.67);
    expect(result.dailyThroughput).toBe(3);
  });

  it("入力なし → 全 null", () => {
    const result = computeOperationalKPIs({});
    expect(result.verifiedRate).toBeNull();
    expect(result.evidenceSufficiencyRate).toBeNull();
    expect(result.avgReviewWaitHours).toBeNull();
    expect(result.avgCycleTimeHours).toBeNull();
    expect(result.slaComplianceRate).toBeNull();
    expect(result.dailyThroughput).toBeNull();
  });

  it("部分入力 → 対応 KPI のみ計算", () => {
    const result = computeOperationalKPIs({
      certificateCounts: { VERIFIED: 10 },
      throughput: { completedCount: 20, periodDays: 10 },
    });
    expect(result.verifiedRate).toBe(100);
    expect(result.dailyThroughput).toBe(2);
    expect(result.avgReviewWaitHours).toBeNull();
  });
});
