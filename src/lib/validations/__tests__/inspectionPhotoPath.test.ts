import { describe, it, expect } from "vitest";
import { inspectionPhotoPathError } from "../inspection";

const T = "11111111-1111-1111-1111-111111111111";
const U = "22222222-2222-4222-a222-222222222222";

describe("inspectionPhotoPathError [点検写真は自テナントの保存パスだけ]", () => {
  it("自テナントの点検写真のパスは通す。未指定・空も通す", () => {
    expect(inspectionPhotoPathError(T, [`inspections/${T}/${U}.jpg`, `inspections/${T}/${U}.webp`])).toBeNull();
    expect(inspectionPhotoPathError(T, undefined)).toBeNull();
    expect(inspectionPhotoPathError(T, [])).toBeNull();
  });

  it("他テナント・他の保存先・URL・data URL・パスの細工は通さない", () => {
    const other = "33333333-3333-3333-3333-333333333333";
    for (const p of [
      `inspections/${other}/${U}.jpg`,
      `${T}/cert/${U}.jpg`,
      `https://x.supabase.co/storage/v1/object/public/assets/inspections/${T}/${U}.jpg`,
      "data:image/jpeg;base64,AAAA",
      `inspections/${T}/../${other}/${U}.jpg`,
      `inspections/${T}/${U}.jpg.png/x`,
    ]) {
      expect(inspectionPhotoPathError(T, [`inspections/${T}/${U}.jpg`, p])).not.toBeNull();
    }
  });
});
