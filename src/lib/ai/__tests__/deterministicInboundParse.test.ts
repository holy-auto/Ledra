import { describe, it, expect } from "vitest";
import { deterministicServiceVehicle } from "../deterministicInboundParse";

describe("deterministicServiceVehicle", () => {
  // 本番で AI 抽出が取りこぼした実メッセージ (has_service/has_vehicle=false になったもの)。
  it("extracts vehicle+service from '車種のコーティング見積りが欲しい' (possessive, no maker)", () => {
    expect(deterministicServiceVehicle("ハイエースのコーティング見積りが欲しい")).toEqual({
      vehicle: "ハイエース",
      service: "コーティング",
    });
  });

  it("extracts maker+model+year and multiple comma-separated services", () => {
    expect(
      deterministicServiceVehicle("トヨタ　ハイエース　2026年式\nボディコーティング、ホイールコーティング"),
    ).toEqual({
      vehicle: "トヨタ ハイエース 2026年式",
      service: "ボディコーティング, ホイールコーティング",
    });
  });

  it("extracts vehicle+service in the same shape as a successful AI run (year kept verbatim)", () => {
    // AI 成功時は vehicle="トヨタ アルファード 2025年式" と正規化したが、決定的抽出は
    // 本文の年式表記をそのまま保持する (「2025年」)。下流の見積りにはどちらでも十分。
    expect(deterministicServiceVehicle("トヨタ　アルファード　2025年\nコーティング")).toEqual({
      vehicle: "トヨタ アルファード 2025年",
      service: "コーティング",
    });
  });

  it("prefers the specific coating term over the generic one (no duplicate)", () => {
    expect(deterministicServiceVehicle("ガラスコーティングお願いします").service).toBe("ガラスコーティング");
  });

  it("keeps services in the order they appear in the text", () => {
    expect(deterministicServiceVehicle("洗車とコーティング").service).toBe("洗車, コーティング");
  });

  it("returns model even without a maker or year", () => {
    expect(deterministicServiceVehicle("アルファードの洗車").vehicle).toBe("アルファード");
  });

  it("handles 令和 (wareki) year notation", () => {
    expect(deterministicServiceVehicle("日産セレナ 令和5年 板金").vehicle).toBe("日産 セレナ 令和5年");
  });

  it("returns nothing for an unrelated message (no false positives)", () => {
    expect(deterministicServiceVehicle("営業時間は何時までですか？")).toEqual({
      service: undefined,
      vehicle: undefined,
    });
  });

  it("does not attach a year when there is no vehicle keyword", () => {
    // 年らしき数字だけあっても車両語が無ければ vehicle は付けない。
    expect(deterministicServiceVehicle("2026年もよろしくお願いします").vehicle).toBeUndefined();
  });

  it("does not misdetect 'ミニバン' as the MINI brand", () => {
    // 「ミニ」は辞書から除外済み。ミニバンはボディタイプであって車種名ではない。
    expect(deterministicServiceVehicle("ミニバンのコーティングお願いします").vehicle).toBeUndefined();
  });

  it("matches Latin model/maker names case-insensitively", () => {
    expect(deterministicServiceVehicle("rav4のコーティング").vehicle).toBe("RAV4");
    expect(deterministicServiceVehicle("bmwの洗車").vehicle).toBe("BMW");
  });

  it("recognizes a model from the vehicle_size_master vocabulary (e.g. American cars)", () => {
    // 固定辞書に無いアメ車も、マスタ由来の語彙を渡せば認識できる。
    const opts = { extraMakers: ["キャデラック"], extraModels: ["エスカレード"] };
    expect(deterministicServiceVehicle("キャデラックのエスカレード、コーティングお願いします", opts)).toEqual({
      vehicle: "キャデラック エスカレード",
      service: "コーティング",
    });
  });

  it("prefers the longest matching model from the merged vocabulary", () => {
    const opts = { extraModels: ["ランドクルーザー300"] };
    // 「ランドクルーザー300」の方が固定辞書の「ランクル」等より具体的なので優先。
    expect(deterministicServiceVehicle("ランドクルーザー300の洗車", opts).vehicle).toContain("ランドクルーザー300");
  });

  it("ignores too-short (≤2 char) extra vocabulary to avoid false positives", () => {
    // 「RA」のような 2 文字語彙は誤爆源なので無視する。
    expect(deterministicServiceVehicle("プログラムの相談です", { extraMakers: ["RA"] }).vehicle).toBeUndefined();
  });

  it("returns empty object for blank input", () => {
    expect(deterministicServiceVehicle("   ")).toEqual({});
  });
});
