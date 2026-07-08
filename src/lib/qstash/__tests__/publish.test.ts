import { describe, it, expect } from "vitest";
import { sanitizeDeduplicationId } from "@/lib/qstash/publish";

describe("sanitizeDeduplicationId", () => {
  it("replaces QStash-reserved chars (':' etc.) with '-'", () => {
    expect(sanitizeDeduplicationId("square-sync:job:abc")).toBe("square-sync-job-abc");
    expect(sanitizeDeduplicationId("a b/c+d=e")).toBe("a-b-c-d-e");
    expect(sanitizeDeduplicationId("ok_key-123")).toBe("ok_key-123");
  });

  it("truncates long keys with a stable, unique digest suffix", () => {
    const longA = `square-sync:job:${"A".repeat(500)}`;
    const longB = `square-sync:job:${"B".repeat(500)}`;

    const a = sanitizeDeduplicationId(longA);
    expect(a.length).toBeLessThanOrEqual(100);
    expect(a.startsWith("square-sync-job-")).toBe(true);
    expect(a).toMatch(/^[a-zA-Z0-9_-]+$/);
    // 同じ入力なら同じキー（deduplication が機能する）、違う入力なら別キー
    expect(sanitizeDeduplicationId(longA)).toBe(a);
    expect(sanitizeDeduplicationId(longB)).not.toBe(a);
  });

  it("keeps unique keys even when sanitization collapses the visible prefix", () => {
    // 置換後のプレフィックスが同一でも sha256 は元文字列から取るので衝突しない
    const x = sanitizeDeduplicationId(`k:${"a:b".repeat(60)}:x`);
    const y = sanitizeDeduplicationId(`k:${"a-b".repeat(60)}:x`);
    expect(x).not.toBe(y);
  });
});
