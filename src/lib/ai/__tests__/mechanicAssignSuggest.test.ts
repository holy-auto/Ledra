import { describe, it, expect } from "vitest";
import { suggestMechanicAssignees, type MechanicStaff } from "../mechanicAssignSuggest";

const STAFF: MechanicStaff[] = [
  { id: "s1", name: "田中", skills: ["PPF", "プロテクションフィルム"], is_active: true },
  { id: "s2", name: "佐藤", skills: ["コーティング", "ガラスコーティング"], is_active: true },
  { id: "s3", name: "鈴木", skills: ["磨き"], is_active: true },
  { id: "s4", name: "退職者", skills: ["コーティング"], is_active: false },
];

describe("suggestMechanicAssignees (純ロジック: AI 段を踏まない経路)", () => {
  it("スキル一致数が最大の職人を先頭に提案する", async () => {
    const r = await suggestMechanicAssignees({
      jobText: "ガラスコーティング施工",
      serviceType: "coating",
      staff: STAFF,
      history: [],
    });
    expect(r.candidates[0].staff_id).toBe("s2");
    expect(r.candidates[0].method).toBe("skill");
    expect(r.ai).toBe(false);
    // 最上位スコアは 1.0 に正規化される。
    expect(r.candidates[0].score).toBe(1);
  });

  it("非稼働 (is_active=false) の職人は候補に出さない", async () => {
    const r = await suggestMechanicAssignees({
      jobText: "コーティング",
      serviceType: "coating",
      staff: STAFF,
      history: [],
    });
    expect(r.candidates.some((c) => c.staff_id === "s4")).toBe(false);
  });

  it("スキル一致ゼロなら過去の同 service_type 担当履歴の頻度で提案する", async () => {
    // 板金スキルを持つ職人はいない → スキルマッチ 0。履歴で s3 が板金を多く担当。
    const r = await suggestMechanicAssignees({
      jobText: "板金修理",
      serviceType: "body_repair",
      staff: STAFF,
      history: [
        { service_type: "body_repair", assigned_staff_id: "s3" },
        { service_type: "body_repair", assigned_staff_id: "s3" },
        { service_type: "body_repair", assigned_staff_id: "s1" },
        { service_type: "coating", assigned_staff_id: "s2" }, // 別種は無視される
      ],
    });
    expect(r.candidates[0].staff_id).toBe("s3");
    expect(r.candidates[0].method).toBe("history");
    expect(r.candidates[0].score).toBeCloseTo(2 / 3);
  });

  it("履歴の担当者が非稼働なら履歴からも除外する", async () => {
    const r = await suggestMechanicAssignees({
      jobText: "板金",
      serviceType: "body_repair",
      staff: STAFF,
      history: [
        { service_type: "body_repair", assigned_staff_id: "s4" }, // 非稼働 → 除外
        { service_type: "body_repair", assigned_staff_id: "s1" },
      ],
    });
    expect(r.candidates.some((c) => c.staff_id === "s4")).toBe(false);
    expect(r.candidates[0].staff_id).toBe("s1");
  });

  it("職人が 1 人もいなければ空の候補を返す", async () => {
    const r = await suggestMechanicAssignees({
      jobText: "コーティング",
      serviceType: "coating",
      staff: [],
      history: [],
    });
    expect(r.candidates).toEqual([]);
  });

  it("推定した必要スキルタグを jobTags に返す", async () => {
    const r = await suggestMechanicAssignees({
      jobText: "PPF貼り付け",
      serviceType: "ppf",
      staff: STAFF,
      history: [],
    });
    expect(r.jobTags).toContain("PPF");
    expect(r.candidates[0].staff_id).toBe("s1");
  });
});
