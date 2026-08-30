import { describe, it, expect } from "vitest";
import {
  createWorkflowSnapshot,
  diffTemplateSteps,
  isSnapshotStale,
  resolveStepFromSnapshot,
  computeSnapshotProgress,
  type TemplateStep,
  type WorkflowSnapshot,
} from "../templateVersion";

// ── ヘルパ ──

const mkStep = (overrides?: Partial<TemplateStep>): TemplateStep => ({
  order: 1,
  key: "reception",
  label: "来店受付",
  is_customer_visible: true,
  estimated_min: 5,
  ...overrides,
});

const STEPS_3: TemplateStep[] = [
  mkStep({ order: 1, key: "reception", label: "来店受付" }),
  mkStep({ order: 2, key: "wash", label: "洗車", estimated_min: 30 }),
  mkStep({ order: 3, key: "coating", label: "コーティング施工", estimated_min: 60 }),
];

const mkTemplate = () => ({
  id: "tmpl-1",
  name: "コーティング標準",
  service_type: "coating",
  steps: STEPS_3,
  updated_at: "2026-08-01T00:00:00Z",
});

// ── createWorkflowSnapshot ──

describe("createWorkflowSnapshot", () => {
  it("テンプレートからスナップショットを作成", () => {
    const snap = createWorkflowSnapshot(mkTemplate());
    expect(snap.templateId).toBe("tmpl-1");
    expect(snap.templateName).toBe("コーティング標準");
    expect(snap.serviceType).toBe("coating");
    expect(snap.steps).toHaveLength(3);
    expect(snap.templateUpdatedAt).toBe("2026-08-01T00:00:00Z");
    expect(snap.frozenAt).toBeTruthy();
  });

  it("steps は deep copy（元テンプレートと独立）", () => {
    const tmpl = mkTemplate();
    const snap = createWorkflowSnapshot(tmpl);
    tmpl.steps[0].label = "変更後";
    expect(snap.steps[0].label).toBe("来店受付");
  });

  it("required_photos / checklist 配列も独立コピー", () => {
    const tmpl = mkTemplate();
    tmpl.steps[0].required_photos = ["前方", "後方"];
    tmpl.steps[0].checklist = ["確認A"];
    const snap = createWorkflowSnapshot(tmpl);
    tmpl.steps[0].required_photos.push("側面");
    tmpl.steps[0].checklist.push("確認B");
    expect(snap.steps[0].required_photos).toEqual(["前方", "後方"]);
    expect(snap.steps[0].checklist).toEqual(["確認A"]);
  });
});

// ── diffTemplateSteps ──

describe("diffTemplateSteps", () => {
  it("同一 → hasChanges=false", () => {
    const diff = diffTemplateSteps(STEPS_3, STEPS_3);
    expect(diff.hasChanges).toBe(false);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it("ステップ追加を検出", () => {
    const after = [...STEPS_3, mkStep({ order: 4, key: "billing", label: "会計" })];
    const diff = diffTemplateSteps(STEPS_3, after);
    expect(diff.hasChanges).toBe(true);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].key).toBe("billing");
  });

  it("ステップ削除を検出", () => {
    const after = STEPS_3.slice(0, 2);
    const diff = diffTemplateSteps(STEPS_3, after);
    expect(diff.hasChanges).toBe(true);
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0].key).toBe("coating");
  });

  it("ラベル変更を検出", () => {
    const after = STEPS_3.map((s) => (s.key === "wash" ? { ...s, label: "手洗い洗車" } : s));
    const diff = diffTemplateSteps(STEPS_3, after);
    expect(diff.hasChanges).toBe(true);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].key).toBe("wash");
    expect(diff.modified[0].changedFields).toContain("label");
  });

  it("estimated_min 変更を検出", () => {
    const after = STEPS_3.map((s) => (s.key === "coating" ? { ...s, estimated_min: 90 } : s));
    const diff = diffTemplateSteps(STEPS_3, after);
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].changedFields).toContain("estimated_min");
  });

  it("order のみ変更 → reordered に入る", () => {
    const after = STEPS_3.map((s) =>
      s.key === "wash" ? { ...s, order: 3 } : s.key === "coating" ? { ...s, order: 2 } : s,
    );
    const diff = diffTemplateSteps(STEPS_3, after);
    expect(diff.reordered).toContain("wash");
    expect(diff.reordered).toContain("coating");
    // order のみの変更は modified には入らない
    expect(diff.modified).toHaveLength(0);
  });

  it("空配列同士 → hasChanges=false", () => {
    expect(diffTemplateSteps([], []).hasChanges).toBe(false);
  });

  it("required_photos 変更を検出", () => {
    const before = [mkStep({ key: "inspect", required_photos: ["前方", "後方"] })];
    const after = [mkStep({ key: "inspect", required_photos: ["前方", "後方", "側面"] })];
    const diff = diffTemplateSteps(before, after);
    expect(diff.modified[0].changedFields).toContain("required_photos");
  });

  it("key 重複時は最初の出現を採用（resolveStepFromSnapshot と同じ規則）", () => {
    // 同じ key "dup" が2件 — 2件目は無視され、1件目基準で比較される
    const before = [mkStep({ key: "dup", label: "1件目", estimated_min: 10 })];
    const after = [
      mkStep({ key: "dup", label: "1件目", estimated_min: 10 }),
      mkStep({ key: "dup", label: "2件目", estimated_min: 999 }),
    ];
    const diff = diffTemplateSteps(before, after);
    // 1件目同士は同一なので変更なし。2件目は無視されるため added にも modified にも現れない
    expect(diff.hasChanges).toBe(false);
  });
});

// ── isSnapshotStale ──

describe("isSnapshotStale", () => {
  it("updated_at 一致 → stale ではない", () => {
    const snap: WorkflowSnapshot = {
      templateId: "tmpl-1",
      templateName: "コーティング標準",
      serviceType: "coating",
      steps: STEPS_3,
      frozenAt: "2026-08-01T00:00:00Z",
      templateUpdatedAt: "2026-08-01T00:00:00Z",
    };
    expect(isSnapshotStale(snap, { updated_at: "2026-08-01T00:00:00Z", steps: STEPS_3 })).toBe(false);
  });

  it("updated_at 不一致だが steps 同一 → stale ではない", () => {
    const snap: WorkflowSnapshot = {
      templateId: "tmpl-1",
      templateName: "コーティング標準",
      serviceType: "coating",
      steps: STEPS_3,
      frozenAt: "2026-08-01T00:00:00Z",
      templateUpdatedAt: "2026-08-01T00:00:00Z",
    };
    // 名前だけ変更（steps は同一）
    expect(isSnapshotStale(snap, { updated_at: "2026-08-15T00:00:00Z", steps: STEPS_3 })).toBe(false);
  });

  it("steps 変更あり → stale", () => {
    const snap: WorkflowSnapshot = {
      templateId: "tmpl-1",
      templateName: "コーティング標準",
      serviceType: "coating",
      steps: STEPS_3,
      frozenAt: "2026-08-01T00:00:00Z",
      templateUpdatedAt: "2026-08-01T00:00:00Z",
    };
    const modified = [...STEPS_3, mkStep({ order: 4, key: "billing", label: "会計" })];
    expect(isSnapshotStale(snap, { updated_at: "2026-08-15T00:00:00Z", steps: modified })).toBe(true);
  });
});

// ── resolveStepFromSnapshot ──

describe("resolveStepFromSnapshot", () => {
  const snap: WorkflowSnapshot = {
    templateId: "tmpl-1",
    templateName: "コーティング標準",
    serviceType: "coating",
    steps: STEPS_3,
    frozenAt: "2026-08-01T00:00:00Z",
    templateUpdatedAt: "2026-08-01T00:00:00Z",
  };

  it("key 一致 → ステップを返す", () => {
    const step = resolveStepFromSnapshot(snap, "wash");
    expect(step).not.toBeNull();
    expect(step!.label).toBe("洗車");
  });

  it("key 不一致 → null", () => {
    expect(resolveStepFromSnapshot(snap, "nonexistent")).toBeNull();
  });

  it("snapshot が null → null", () => {
    expect(resolveStepFromSnapshot(null, "wash")).toBeNull();
  });
});

// ── computeSnapshotProgress ──

describe("computeSnapshotProgress", () => {
  const snap: WorkflowSnapshot = {
    templateId: "tmpl-1",
    templateName: "コーティング標準",
    serviceType: "coating",
    steps: STEPS_3,
    frozenAt: "2026-08-01T00:00:00Z",
    templateUpdatedAt: "2026-08-01T00:00:00Z",
  };

  it("0 件完了 → 0%", () => {
    expect(computeSnapshotProgress(snap, new Set())).toBe(0);
  });

  it("1/3 完了 → 33%", () => {
    expect(computeSnapshotProgress(snap, new Set(["reception"]))).toBe(33);
  });

  it("全完了 → 100%", () => {
    expect(computeSnapshotProgress(snap, new Set(["reception", "wash", "coating"]))).toBe(100);
  });

  it("steps が空 → 100%", () => {
    const empty: WorkflowSnapshot = { ...snap, steps: [] };
    expect(computeSnapshotProgress(empty, new Set())).toBe(100);
  });
});
