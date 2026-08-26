import { describe, it, expect } from "vitest";
import { parseMileageKm, MAX_MILEAGE_KM, certificateMileageKm, mergeMileageOnEdit } from "../mileage";

describe("parseMileageKm", () => {
  it("accepts a plain reading", () => {
    expect(parseMileageKm("35000")).toBe(35000);
    expect(parseMileageKm(35000)).toBe(35000);
    expect(parseMileageKm(" 35000 ")).toBe(35000);
  });

  it("rejects what the DB trigger would silently drop", () => {
    // fn_sync_mileage_from_certificate ignores null and <= 0, so the form must
    // not accept them — otherwise the entry vanishes with no error.
    expect(parseMileageKm("")).toBeNull();
    expect(parseMileageKm(null)).toBeNull();
    expect(parseMileageKm(undefined)).toBeNull();
    expect(parseMileageKm("0")).toBeNull();
    expect(parseMileageKm("-1")).toBeNull();
  });

  it("rejects non-integers and stray units", () => {
    expect(parseMileageKm("abc")).toBeNull();
    expect(parseMileageKm("35000km")).toBeNull();
    expect(parseMileageKm("35.5")).toBeNull();
  });

  it("rejects an extra-digit typo but keeps a high-mileage car", () => {
    expect(parseMileageKm(String(MAX_MILEAGE_KM))).toBe(MAX_MILEAGE_KM);
    expect(parseMileageKm(String(MAX_MILEAGE_KM + 1))).toBeNull();
    expect(parseMileageKm("350000")).toBe(350000);
  });
});

describe("certificateMileageKm — 発行時ゲートの判定", () => {
  it("有効な走行距離だけを返す", () => {
    expect(certificateMileageKm({ mileage: 35000 })).toBe(35000);
    expect(certificateMileageKm({ mileage: "35000" })).toBe(35000);
    expect(certificateMileageKm({ work_type: "オイル交換" })).toBeNull();
    expect(certificateMileageKm({ mileage: 0 })).toBeNull();
    expect(certificateMileageKm({ mileage: "35000km" })).toBeNull();
  });

  it("maintenance_json が JSON オブジェクトでなければ null", () => {
    // typeof [] === "object" なので配列は明示的に弾く必要がある。
    expect(certificateMileageKm([{ mileage: 35000 }])).toBeNull();
    expect(certificateMileageKm(null)).toBeNull();
    expect(certificateMileageKm(undefined)).toBeNull();
    expect(certificateMileageKm("35000")).toBeNull();
  });
});

describe("mergeMileageOnEdit — 入れられるが消せない", () => {
  it("走行距離を持たない payload では既存値を消さない", () => {
    const r = mergeMileageOnEdit({ mileage: 35000 }, { work_type: "オイル交換" });
    expect(r).toEqual({ ok: true, maintenanceJson: { work_type: "オイル交換", mileage: 35000 } });
  });

  it("mileage: null を送っても既存値を消せない", () => {
    const r = mergeMileageOnEdit({ mileage: 35000 }, { mileage: null });
    expect(r.ok && r.maintenanceJson.mileage).toBe(35000);
  });

  it("訂正 (上書き) は許可する", () => {
    const r = mergeMileageOnEdit({ mileage: 35000 }, { mileage: "36000" });
    expect(r.ok && r.maintenanceJson.mileage).toBe(36000);
  });

  it("遡及入力: 既存値が無い証明書にも入れられる", () => {
    const r = mergeMileageOnEdit(null, { mileage: 88000 });
    expect(r.ok && r.maintenanceJson.mileage).toBe(88000);
  });

  it("既存も入力も無ければ何も足さない", () => {
    const r = mergeMileageOnEdit(null, { work_type: "洗車" });
    expect(r).toEqual({ ok: true, maintenanceJson: { work_type: "洗車" } });
  });

  it("不正な値は黙って捨てず 400 用のエラーを返す", () => {
    expect(mergeMileageOnEdit({ mileage: 35000 }, { mileage: 0 }).ok).toBe(false);
    expect(mergeMileageOnEdit(null, { mileage: "35000km" }).ok).toBe(false);
    expect(mergeMileageOnEdit(null, { mileage: -1 }).ok).toBe(false);
  });

  it("maintenance_json が配列なら形式エラー", () => {
    const r = mergeMileageOnEdit(null, [{ mileage: 35000 }]);
    expect(r).toEqual({ ok: false, error: "maintenance_json の形式が不正です。" });
  });
});
