import { describe, it, expect } from "vitest";
import { autofillMessage, filledFieldLabels } from "./shakenshoAutofill";

describe("autofillMessage", () => {
  it("全項目 null は「読み取れませんでした」を返す（無反応にしない）", () => {
    const msg = autofillMessage({
      extracted: { maker: null, model: null, year: null, vin_code: null, plate_display: null },
    });
    expect(msg.type).toBe("error");
    expect(msg.text).toContain("読み取れませんでした");
  });

  it("extracted 自体が無い応答もエラー扱いにする", () => {
    expect(autofillMessage({}).type).toBe("error");
    expect(autofillMessage(null).type).toBe("error");
  });

  it("AI 自動入力 OFF は設定が原因だと分かる文言を返す", () => {
    const msg = autofillMessage({ ai_disabled: true, extracted: { maker: null } });
    expect(msg.type).toBe("error");
    expect(msg.text).toContain("AI自動入力");
  });

  it("1 項目でも入れば成功メッセージに項目名を並べる", () => {
    const msg = autofillMessage({ extracted: { maker: "トヨタ", year: 2022 } });
    expect(msg).toEqual({ type: "success", text: "メーカー・年式を自動入力しました" });
  });

  it("画面が反映しない項目だけが埋まった場合は成功にしない", () => {
    const res = { extracted: { expiry_date: "2027-03-01" } };
    expect(autofillMessage(res).type).toBe("success");
    expect(autofillMessage(res, ["maker", "model"]).type).toBe("error");
  });
});

describe("filledFieldLabels", () => {
  it("空文字は未入力として扱う", () => {
    expect(filledFieldLabels({ maker: "", model: "アルファード" })).toEqual(["車種"]);
  });
});
