import { describe, it, expect } from "vitest";
import { selectVehiclesToReanchor, type MetaAnchorCandidate, type ExistingMetaAnchor } from "@/lib/parts/anchorService";

const cand = (vehicleId: string, latestVerifiedAt: string, tenantId = "t1"): MetaAnchorCandidate => ({
  vehicleId,
  tenantId,
  latestVerifiedAt,
});

const anchor = (updatedAt: string, hasTx = true, metaHash = "h"): ExistingMetaAnchor => ({
  metaHash,
  updatedAt,
  hasTx,
});

describe("selectVehiclesToReanchor", () => {
  it("未アンカーの車両は選定される", () => {
    const picked = selectVehiclesToReanchor([cand("v1", "2026-06-01T00:00:00.000Z")], new Map(), 25);
    expect(picked.map((x) => x.vehicleId)).toEqual(["v1"]);
  });

  it("前回アンカー以降に新しい確定がある車両（変更）は選定される", () => {
    const existing = new Map([["v1", anchor("2026-06-01T00:00:00.000Z")]]);
    const picked = selectVehiclesToReanchor([cand("v1", "2026-06-02T00:00:00.000Z")], existing, 25);
    expect(picked.map((x) => x.vehicleId)).toEqual(["v1"]);
  });

  it("最新確定が前回アンカー以前の車両（最新＝clean）は除外される", () => {
    const existing = new Map([["v1", anchor("2026-06-02T00:00:00.000Z")]]);
    const picked = selectVehiclesToReanchor([cand("v1", "2026-06-01T00:00:00.000Z")], existing, 25);
    expect(picked).toEqual([]);
  });

  it("tx 未付与（アンカー失敗）の車両はリトライ対象として選定される", () => {
    // updatedAt は新しい（変更なし）が、tx が無いので再アンカーが必要。
    const existing = new Map([["v1", anchor("2026-06-02T00:00:00.000Z", false)]]);
    const picked = selectVehiclesToReanchor([cand("v1", "2026-06-01T00:00:00.000Z")], existing, 25);
    expect(picked.map((x) => x.vehicleId)).toEqual(["v1"]);
  });

  it("アンカー無効化環境（anchoringEnabled=false）では tx なし＋新規データなし → clean", () => {
    // POLYGON_ANCHOR_ENABLED=false 時: tx 欠落だけでリトライせず、データ変化時のみ処理する。
    const existing = new Map([["v1", anchor("2026-06-02T00:00:00.000Z", false)]]);
    const picked = selectVehiclesToReanchor([cand("v1", "2026-06-01T00:00:00.000Z")], existing, 25, false);
    expect(picked).toEqual([]);
  });

  it("アンカー無効化環境でも新規データがあれば dirty", () => {
    const existing = new Map([["v1", anchor("2026-06-01T00:00:00.000Z", false)]]);
    const picked = selectVehiclesToReanchor([cand("v1", "2026-06-02T00:00:00.000Z")], existing, 25, false);
    expect(picked.map((x) => x.vehicleId)).toEqual(["v1"]);
  });

  it("回帰: 新規車両は大量の clean な旧車両に阻まれず選定される（starvation 解消）", () => {
    // 旧実装は最古 limit 台を毎回再処理し、新規車両が永久に未アンカーだった。
    const clean = Array.from({ length: 50 }, (_, i) => cand(`old${i}`, "2026-01-01T00:00:00.000Z"));
    const existing = new Map<string, ExistingMetaAnchor>(
      clean.map((c) => [c.vehicleId, anchor("2026-02-01T00:00:00.000Z")]),
    );
    // DESC 順想定なので新規が先頭、その後に clean な旧車両が並ぶ。
    const candidates = [cand("new1", "2026-06-05T00:00:00.000Z"), ...clean];
    const picked = selectVehiclesToReanchor(candidates, existing, 25).map((x) => x.vehicleId);
    expect(picked).toEqual(["new1"]); // clean は全除外、dirty な new1 のみ
  });

  it("limit を超えない・重複車両は1回だけ（最初＝最新の出現を採用）", () => {
    const candidates = [
      cand("v1", "2026-06-01T00:00:00.000Z"),
      cand("v1", "2026-05-01T00:00:00.000Z"),
      cand("v2", "2026-06-01T00:00:00.000Z"),
      cand("v3", "2026-06-01T00:00:00.000Z"),
    ];
    const picked = selectVehiclesToReanchor(candidates, new Map(), 2);
    expect(picked.map((x) => x.vehicleId)).toEqual(["v1", "v2"]);
  });

  it("limit<=0 は空を返す", () => {
    expect(selectVehiclesToReanchor([cand("v1", "2026-06-01T00:00:00.000Z")], new Map(), 0)).toEqual([]);
  });
});
