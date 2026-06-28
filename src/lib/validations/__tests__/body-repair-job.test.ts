import { describe, it, expect } from "vitest";
import {
  bodyRepairJobCreateSchema,
  bodyRepairJobUpdateSchema,
  workContentSchema,
  PHOTO_STAGES,
  PHOTO_STAGE_LABEL,
} from "../body-repair-job";

describe("bodyRepairJobCreateSchema — ガイドライン準拠フィールド", () => {
  it("最小ペイロード (空) を受理し stage 既定が intake になる", () => {
    const r = bodyRepairJobCreateSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.stage).toBe("intake");
  });

  it("予定作業内容・特定整備・関連付け ID を受理する", () => {
    const r = bodyRepairJobCreateSchema.safeParse({
      is_specified_maintenance: true,
      planned_work: { methods: "ドアパネル交換", parts: "右ドア(純正)", paint: "ベースコート" },
      certificate_id: "11111111-1111-4111-8111-111111111111",
      estimate_document_id: "22222222-2222-4222-8222-222222222222",
      estimate_amount: 180000,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.is_specified_maintenance).toBe(true);
      expect(r.data.planned_work).toMatchObject({ methods: "ドアパネル交換" });
    }
  });

  it("不正な UUID の関連付け ID を弾く", () => {
    const r = bodyRepairJobCreateSchema.safeParse({ certificate_id: "not-a-uuid" });
    expect(r.success).toBe(false);
  });

  it("負の見積金額を弾く", () => {
    const r = bodyRepairJobCreateSchema.safeParse({ estimate_amount: -1 });
    expect(r.success).toBe(false);
  });

  it("納期 (due_date) を YYYY-MM-DD で受理し、空文字は null に正規化する", () => {
    const ok = bodyRepairJobCreateSchema.safeParse({ due_date: "2026-07-15" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.due_date).toBe("2026-07-15");

    const empty = bodyRepairJobCreateSchema.safeParse({ due_date: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.due_date).toBeNull();
  });

  it("不正な日付形式の納期を弾く", () => {
    expect(bodyRepairJobCreateSchema.safeParse({ due_date: "2026/07/15" }).success).toBe(false);
    expect(bodyRepairJobCreateSchema.safeParse({ due_date: "来週" }).success).toBe(false);
  });
});

describe("bodyRepairJobUpdateSchema — 部分更新セマンティクス", () => {
  it("planned_work を送らなければ undefined のまま (既存を上書きしない)", () => {
    const r = bodyRepairJobUpdateSchema.safeParse({ id: "33333333-3333-4333-8333-333333333333" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.planned_work).toBeUndefined();
      expect(r.data.actual_work).toBeUndefined();
    }
  });

  it("null は明示クリア ({}) に正規化される", () => {
    const r = bodyRepairJobUpdateSchema.safeParse({
      id: "33333333-3333-4333-8333-333333333333",
      actual_work: null,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.actual_work).toEqual({});
  });

  it("実績作業と差異理由・実績金額を受理する", () => {
    const r = bodyRepairJobUpdateSchema.safeParse({
      id: "33333333-3333-4333-8333-333333333333",
      actual_work: { methods: "追加でフェンダー板金" },
      deviation_reason: "内部に追加損傷を発見したため",
      actual_amount: 195000,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.deviation_reason).toBe("内部に追加損傷を発見したため");
      expect(r.data.actual_amount).toBe(195000);
    }
  });

  it("id が無いと弾く", () => {
    const r = bodyRepairJobUpdateSchema.safeParse({ actual_amount: 100 });
    expect(r.success).toBe(false);
  });
});

describe("workContentSchema", () => {
  it("全項目任意で部分指定できる", () => {
    expect(workContentSchema.safeParse({ methods: "塗装" }).success).toBe(true);
    expect(workContentSchema.safeParse({}).success).toBe(true);
  });

  it("methods が長すぎると弾く", () => {
    const r = workContentSchema.safeParse({ methods: "あ".repeat(2001) });
    expect(r.success).toBe(false);
  });
});

describe("PHOTO_STAGES — ガイドライン4.2(1) の3段階", () => {
  it("3段階 + 未指定を持つ", () => {
    expect(PHOTO_STAGES).toEqual(["intake_before", "in_progress", "after", "unspecified"]);
  });
  it("すべての段階にラベルがある", () => {
    for (const s of PHOTO_STAGES) expect(PHOTO_STAGE_LABEL[s]).toBeTruthy();
  });
});
