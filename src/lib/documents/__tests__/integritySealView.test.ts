import { describe, it, expect } from "vitest";
import { describeIntegritySeal } from "@/lib/documents/integritySealView";

describe("describeIntegritySeal", () => {
  it("封印が無ければ null", () => {
    expect(describeIntegritySeal(null)).toBeNull();
    expect(describeIntegritySeal({})).toBeNull();
    expect(describeIntegritySeal({ integrity_seal: { foo: 1 } })).toBeNull(); // hash 欠落
  });

  it("ハッシュのみの封印はタイムスタンプ無しと区別する", () => {
    const v = describeIntegritySeal({
      integrity_seal: { hash_sha256: "abc", timestamp_token_b64: null },
    });
    expect(v).not.toBeNull();
    expect(v!.hasTimestamp).toBe(false);
    expect(v!.detail).toBeNull();
    expect(v!.label).toContain("ハッシュ");
  });

  it("タイムスタンプ付き封印は TS局・時刻を出す", () => {
    const v = describeIntegritySeal({
      integrity_seal: {
        hash_sha256: "abc",
        timestamp_token_b64: "AAAA",
        timestamp_authority: "timestamp.digicert.com",
        timestamp_at: "2026-08-04T23:56:50.000Z",
      },
    });
    expect(v).not.toBeNull();
    expect(v!.hasTimestamp).toBe(true);
    expect(v!.label).toContain("タイムスタンプ");
    expect(v!.detail).toContain("timestamp.digicert.com");
    // 2026-08-04 23:56 UTC = 2026-08-05 08:56 JST（+9h、日付繰り上がり）
    expect(v!.detail).toContain("2026");
    expect(v!.detail).toContain("08:56");
    expect(v!.detail).toContain("JST");
  });
});
