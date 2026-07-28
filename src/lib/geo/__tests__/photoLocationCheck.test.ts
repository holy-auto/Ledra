import { describe, it, expect } from "vitest";
import { haversineMeters, isValidLatLng } from "../distance";
import { checkPhotoLocation, bucketDistance } from "../photoLocationCheck";

const TOKYO = { lat: 35.681236, lng: 139.767125 }; // 東京駅
const SHINJUKU = { lat: 35.690921, lng: 139.700258 }; // 新宿駅（東京駅から約6.2km）

describe("haversineMeters", () => {
  it("同一点は0", () => {
    expect(haversineMeters(TOKYO, TOKYO)).toBeCloseTo(0, 5);
  });
  it("東京駅↔新宿駅は約6.2km（±300m）", () => {
    const m = haversineMeters(TOKYO, SHINJUKU);
    expect(m).toBeGreaterThan(5900);
    expect(m).toBeLessThan(6500);
  });
});

describe("isValidLatLng", () => {
  it("範囲外/NaN/非オブジェクトを弾く", () => {
    expect(isValidLatLng({ lat: 35, lng: 139 })).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 139 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 139 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });
});

describe("bucketDistance", () => {
  it("距離を粗い帯に丸める", () => {
    expect(bucketDistance(500)).toBe("within_1km");
    expect(bucketDistance(6200)).toBe("within_10km");
    expect(bucketDistance(30000)).toBe("within_50km");
    expect(bucketDistance(120000)).toBe("beyond_50km");
  });
});

describe("checkPhotoLocation", () => {
  it("店舗の許容半径内は match_store", () => {
    const r = checkPhotoLocation({ photo: TOKYO, store: { lat: 35.6816, lng: 139.7671 }, radiusMeters: 2000 });
    expect(r.verdict).toBe("match_store");
    expect(r.distanceBucket).toBe("within_1km");
  });
  it("半径を超えると mismatch（距離帯付き）", () => {
    const r = checkPhotoLocation({ photo: TOKYO, store: SHINJUKU, radiusMeters: 2000 });
    expect(r.verdict).toBe("mismatch");
    expect(r.distanceBucket).toBe("within_10km");
  });
  it("写真GPS無しは no_gps", () => {
    expect(checkPhotoLocation({ photo: null, store: TOKYO }).verdict).toBe("no_gps");
  });
  it("基準座標無しは no_reference", () => {
    expect(checkPhotoLocation({ photo: TOKYO, store: null }).verdict).toBe("no_reference");
  });

  // ── C4: 出張作業場所との照合 ──
  it("店舗から離れていても出張作業場所の半径内なら match_worksite", () => {
    // 店舗=東京駅(遠い)、作業場所=新宿駅近傍、写真=新宿駅 → 作業場所一致。
    const r = checkPhotoLocation({
      photo: SHINJUKU,
      store: TOKYO,
      worksite: { lat: 35.6909, lng: 139.7002 },
      radiusMeters: 2000,
    });
    expect(r.verdict).toBe("match_worksite");
    expect(r.distanceBucket).toBe("within_1km");
  });
  it("店舗一致は作業場所より優先（両方の半径内でも match_store）", () => {
    const r = checkPhotoLocation({ photo: TOKYO, store: { lat: 35.6816, lng: 139.7671 }, worksite: TOKYO });
    expect(r.verdict).toBe("match_store");
  });
  it("店舗にも作業場所にも一致しなければ mismatch（最も近い基準の距離帯）", () => {
    const r = checkPhotoLocation({ photo: TOKYO, store: SHINJUKU, worksite: SHINJUKU, radiusMeters: 2000 });
    expect(r.verdict).toBe("mismatch");
    expect(r.distanceBucket).toBe("within_10km");
  });
  it("店舗未登録でも作業場所があれば照合する（no_reference にしない）", () => {
    const r = checkPhotoLocation({ photo: TOKYO, store: null, worksite: { lat: 35.6816, lng: 139.7671 } });
    expect(r.verdict).toBe("match_worksite");
  });
  it("店舗も作業場所も無ければ no_reference", () => {
    expect(checkPhotoLocation({ photo: TOKYO, store: null, worksite: null }).verdict).toBe("no_reference");
  });
});
