import { describe, it, expect } from "vitest";
import { omitPlate } from "@/lib/certificates/publicData";

describe("omitPlate", () => {
  it("drops every plate key the /c page used to read, keeps the rest", () => {
    expect(
      omitPlate({
        maker: "トヨタ",
        model: "プリウス",
        plate: "品川300あ1234",
        plate_display: "x",
        plate_no: "x",
        number: "x",
      }),
    ).toEqual({ maker: "トヨタ", model: "プリウス" });
  });

  it("does not mutate the input", () => {
    const info = { plate: "品川300あ1234" };
    omitPlate(info);
    expect(info.plate).toBe("品川300あ1234");
  });

  it("passes through non-object values", () => {
    expect(omitPlate(null)).toBeNull();
    expect(omitPlate([1])).toEqual([1]);
  });
});
