import { describe, it, expect } from "vitest";
import { aggregateFtProject } from "../projectAggregate";

/**
 * report と analytics が共有する集計の振る舞いテスト（#1117 で重複を1本化）。
 * 施工店別の pass/fail・平均スコア・欠陥/証拠の割り当て、inspection の job_id→tenant_id
 * 経由の帰属が正しいことを確かめる。
 */

// admin クライアントの最小フェイク。テーブルごとに固定データを返す。
// .from(t).select(...).match(...) と .from("tenants").select(...).in(...) をどちらも
// awaitable にする（末尾が then を持つ）。
function fakeAdmin(data: {
  ft_jobs: unknown[];
  ft_inspections: unknown[];
  ft_defects: unknown[];
  ft_evidence: unknown[];
  tenants: unknown[];
}) {
  const make = (table: keyof typeof data) => {
    const result = { data: data[table], error: null };
    const b: Record<string, unknown> = {
      then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
    };
    for (const m of ["select", "match", "in", "eq"]) b[m] = () => b;
    return b;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => make(t as keyof typeof data) } as any;
}

describe("aggregateFtProject", () => {
  it("グローバル集計と施工店別内訳を正しく出す", async () => {
    const admin = fakeAdmin({
      ft_jobs: [
        { id: "j1", status: "completed", tenant_id: "tA", completed_at: "2026-09-01T00:00:00Z" },
        { id: "j2", status: "assigned", tenant_id: "tA", completed_at: null },
        { id: "j3", status: "completed", tenant_id: "tB", completed_at: "2026-09-02T00:00:00Z" },
      ],
      ft_inspections: [
        { result: "pass", score: 80, job_id: "j1" },
        { result: "fail", score: 40, job_id: "j3" },
        { result: "pending", score: null, job_id: "j2" },
      ],
      ft_defects: [
        { severity: "high", status: "open", tenant_id: "tA" },
        { severity: "low", status: "closed", tenant_id: "tB" },
      ],
      ft_evidence: [
        { evidence_type: "photo", tenant_id: "tA" },
        { evidence_type: "photo", tenant_id: "tA" },
        { evidence_type: "video", tenant_id: "tB" },
      ],
      tenants: [
        { id: "tA", name: "工場A" },
        { id: "tB", name: "工場B" },
      ],
    });

    const agg = await aggregateFtProject(admin, { project_id: "p1", manufacturer_id: "m1" });

    expect(agg.jobs.total).toBe(3);
    expect(agg.jobs.by_status).toEqual({ completed: 2, assigned: 1 });
    expect(agg.inspections).toMatchObject({ total: 3, pass: 1, fail: 1, pending: 1, avg_score: 60 });
    expect(agg.defects.total).toBe(2);
    expect(agg.defects.by_severity).toEqual({ high: 1, low: 1 });
    expect(agg.evidence.total).toBe(3);
    expect(agg.evidence.by_type).toEqual({ photo: 2, video: 1 });
    expect(agg.tenants).toEqual({ total: 2, completed_jobs: 2 });

    // jobs 降順（tA=2 が先頭）。inspection は job_id→tenant で帰属。
    const [first, second] = agg.tenants_detail;
    expect(first).toMatchObject({ tenant_id: "tA", tenant_name: "工場A", jobs: 2, completed: 1, pass: 1, evidence: 2 });
    expect(second).toMatchObject({ tenant_id: "tB", tenant_name: "工場B", jobs: 1, fail: 1, avg_score: 40 });
    // tA の平均は pass の 80 のみ（j2 は pending でスコア無し）
    expect(first.avg_score).toBe(80);
  });

  it("空プロジェクトでもゼロ値で返る", async () => {
    const admin = fakeAdmin({ ft_jobs: [], ft_inspections: [], ft_defects: [], ft_evidence: [], tenants: [] });
    const agg = await aggregateFtProject(admin, { project_id: "p1", manufacturer_id: "m1" });
    expect(agg.jobs.total).toBe(0);
    expect(agg.inspections.avg_score).toBeNull();
    expect(agg.tenants).toEqual({ total: 0, completed_jobs: 0 });
    expect(agg.tenants_detail).toEqual([]);
  });
});
