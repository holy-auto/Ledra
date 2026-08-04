import { describe, it, expect } from "vitest";
import { itemContentLines } from "../itemDisplay";

describe("itemContentLines", () => {
  it("内容あり・品番あり: 内容を主、品番を従に出す", () => {
    expect(itemContentLines({ description: "フロアマット取付", item_code: "08P14" })).toEqual({
      primary: "フロアマット取付",
      code: "08P14",
    });
  });

  it("内容あり・品番なし: 従行は null", () => {
    expect(itemContentLines({ description: "工賃", item_code: null })).toEqual({ primary: "工賃", code: null });
  });

  it("内容が空で品番だけ入力された明細: 品番を主行へ昇格し不可視にしない（本バグの核心）", () => {
    expect(itemContentLines({ description: "", item_code: "08P1432R011 フロアカーペットマット" })).toEqual({
      primary: "08P1432R011 フロアカーペットマット",
      code: null,
    });
  });

  it("空白のみの内容も空とみなし品番を昇格する", () => {
    expect(itemContentLines({ description: "   ", item_code: "ABC-123" })).toEqual({ primary: "ABC-123", code: null });
  });

  it("どちらも無ければ '-'", () => {
    expect(itemContentLines({ description: null, item_code: null })).toEqual({ primary: "-", code: null });
    expect(itemContentLines({})).toEqual({ primary: "-", code: null });
  });
});
