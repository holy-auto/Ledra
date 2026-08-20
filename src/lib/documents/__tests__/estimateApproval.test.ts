import { describe, it, expect } from "vitest";
import {
  createApprovalSnapshot,
  diffEstimateRevision,
  isApprovalTrackable,
  shouldCarryApproval,
  type EstimateApprovalSnapshot,
} from "../estimateApproval";
import type { DocumentItem } from "@/types/document";

// ── ヘルパ ──

const mkItem = (overrides?: Partial<DocumentItem>): DocumentItem => ({
  description: "コーティング施工",
  quantity: 1,
  unit_price: 50000,
  amount: 50000,
  ...overrides,
});

const mkDoc = (items: DocumentItem[] = [mkItem()]) => ({
  items_json: items,
  subtotal: items.reduce((s, i) => s + i.amount, 0),
  tax: items.reduce((s, i) => s + Math.round(i.amount * 0.1), 0),
  total: items.reduce((s, i) => s + i.amount + Math.round(i.amount * 0.1), 0),
  tax_rate: 10,
});

// ── createApprovalSnapshot ──

describe("createApprovalSnapshot", () => {
  it("スナップショットを作成", () => {
    const doc = mkDoc();
    const snap = createApprovalSnapshot(doc, "customer@example.com", "customer_web");
    expect(snap.total).toBe(doc.total);
    expect(snap.subtotal).toBe(doc.subtotal);
    expect(snap.tax).toBe(doc.tax);
    expect(snap.taxRate).toBe(10);
    expect(snap.approvedBy).toBe("customer@example.com");
    expect(snap.approvalMethod).toBe("customer_web");
    expect(snap.version).toBe(1);
    expect(snap.approvedAt).toBeTruthy();
  });

  it("明細は deep copy（元の変更がスナップショットに影響しない）", () => {
    const items = [mkItem()];
    const doc = mkDoc(items);
    const snap = createApprovalSnapshot(doc, "test", "verbal_confirmation");
    items[0].description = "変更後";
    expect(snap.items[0].description).toBe("コーティング施工");
  });

  it("version を指定できる", () => {
    const snap = createApprovalSnapshot(mkDoc(), "test", "customer_web", 3);
    expect(snap.version).toBe(3);
  });
});

// ── diffEstimateRevision ──

describe("diffEstimateRevision", () => {
  const baseItems = [
    mkItem({ description: "コーティング施工", quantity: 1, unit_price: 50000, amount: 50000 }),
    mkItem({ description: "洗車", quantity: 1, unit_price: 3000, amount: 3000 }),
  ];
  const baseDoc = mkDoc(baseItems);

  const baseSnapshot: EstimateApprovalSnapshot = {
    items: baseItems,
    subtotal: baseDoc.subtotal,
    tax: baseDoc.tax,
    total: baseDoc.total,
    taxRate: 10,
    approvedAt: "2026-08-20T00:00:00Z",
    approvedBy: "customer@example.com",
    approvalMethod: "customer_web",
    version: 1,
  };

  it("変更なし → hasChanges=false, requiresReapproval=false", () => {
    const diff = diffEstimateRevision(baseSnapshot, baseDoc);
    expect(diff.hasChanges).toBe(false);
    expect(diff.requiresReapproval).toBe(false);
    expect(diff.difference).toBe(0);
  });

  it("明細追加を検出", () => {
    const items = [...baseItems, mkItem({ description: "PPF施工", amount: 80000 })];
    const diff = diffEstimateRevision(baseSnapshot, mkDoc(items));
    expect(diff.hasChanges).toBe(true);
    expect(diff.addedItems).toHaveLength(1);
    expect(diff.addedItems[0].description).toBe("PPF施工");
    expect(diff.requiresReapproval).toBe(true);
  });

  it("明細削除を検出", () => {
    const items = [baseItems[0]]; // 洗車を削除
    const diff = diffEstimateRevision(baseSnapshot, mkDoc(items));
    expect(diff.hasChanges).toBe(true);
    expect(diff.removedItems).toHaveLength(1);
    expect(diff.removedItems[0].description).toBe("洗車");
    expect(diff.requiresReapproval).toBe(true);
  });

  it("金額変更を検出", () => {
    const items = [
      mkItem({ description: "コーティング施工", quantity: 1, unit_price: 60000, amount: 60000 }),
      baseItems[1],
    ];
    const diff = diffEstimateRevision(baseSnapshot, mkDoc(items));
    expect(diff.modifiedItems).toHaveLength(1);
    expect(diff.modifiedItems[0].description).toBe("コーティング施工");
    expect(diff.modifiedItems[0].oldUnitPrice).toBe(50000);
    expect(diff.modifiedItems[0].newUnitPrice).toBe(60000);
    expect(diff.requiresReapproval).toBe(true);
  });

  it("差額と差額率を計算", () => {
    const items = [
      mkItem({ description: "コーティング施工", quantity: 1, unit_price: 55000, amount: 55000 }),
      baseItems[1],
    ];
    const current = mkDoc(items);
    const diff = diffEstimateRevision(baseSnapshot, current);
    expect(diff.difference).toBe(current.total - baseSnapshot.total);
    expect(diff.approvedTotal).toBe(baseSnapshot.total);
    expect(diff.currentTotal).toBe(current.total);
  });

  it("heading/subtotal 行はスキップ", () => {
    const snapshotWithHeading: EstimateApprovalSnapshot = {
      ...baseSnapshot,
      items: [{ item_type: "heading", description: "基本作業", quantity: 0, unit_price: 0, amount: 0 }, ...baseItems],
    };
    const currentItems = [
      { item_type: "heading" as const, description: "基本作業", quantity: 0, unit_price: 0, amount: 0 },
      ...baseItems,
    ];
    const diff = diffEstimateRevision(snapshotWithHeading, mkDoc(currentItems));
    expect(diff.hasChanges).toBe(false);
  });
});

// ── isApprovalTrackable ──

describe("isApprovalTrackable", () => {
  it("estimate → true", () => {
    expect(isApprovalTrackable("estimate")).toBe(true);
  });

  it("invoice → false", () => {
    expect(isApprovalTrackable("invoice")).toBe(false);
  });

  it("delivery → false", () => {
    expect(isApprovalTrackable("delivery")).toBe(false);
  });
});

// ── shouldCarryApproval ──

describe("shouldCarryApproval", () => {
  it("スナップショットなし → false", () => {
    expect(shouldCarryApproval(null, 50000)).toBe(false);
  });

  it("合計一致 → true", () => {
    const snap: EstimateApprovalSnapshot = {
      items: [],
      subtotal: 45000,
      tax: 4500,
      total: 49500,
      taxRate: 10,
      approvedAt: "2026-08-20T00:00:00Z",
      approvedBy: "test",
      approvalMethod: "customer_web",
      version: 1,
    };
    expect(shouldCarryApproval(snap, 49500)).toBe(true);
  });

  it("合計不一致 → false", () => {
    const snap: EstimateApprovalSnapshot = {
      items: [],
      subtotal: 45000,
      tax: 4500,
      total: 49500,
      taxRate: 10,
      approvedAt: "2026-08-20T00:00:00Z",
      approvedBy: "test",
      approvalMethod: "customer_web",
      version: 1,
    };
    expect(shouldCarryApproval(snap, 55000)).toBe(false);
  });
});
