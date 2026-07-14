import { describe, it, expect } from "vitest";
import { emptyStore, makeFakeAdmin } from "@/lib/ai/automation/__tests__/fakeSupabaseAdmin";
import { resolveVehicleSizeClass } from "../resolveSizeClass";

describe("resolveVehicleSizeClass", () => {
  it("derives directly from dimensions when all three are present, skipping the DB lookup", async () => {
    const db = makeFakeAdmin(emptyStore({ vehicle_size_master: [] }));
    const size = await resolveVehicleSizeClass(db, {
      maker: "トヨタ",
      model: "アルファード",
      lengthMm: 4950,
      widthMm: 1850,
      heightMm: 1950,
    });
    expect(size).toBeTruthy();
  });

  it("falls back to vehicle_size_master when dimensions are missing", async () => {
    const store = emptyStore({ vehicle_size_master: [{ maker: "トヨタ", model: "プリウス", size_class: "M" }] });
    const db = makeFakeAdmin(store);
    const size = await resolveVehicleSizeClass(db, { maker: "トヨタ", model: "プリウス" });
    expect(size).toBe("M");
  });

  it("returns null when neither dimensions nor a master row are available", async () => {
    const db = makeFakeAdmin(emptyStore({ vehicle_size_master: [] }));
    const size = await resolveVehicleSizeClass(db, { maker: "トヨタ", model: "不明" });
    expect(size).toBeNull();
  });
});
