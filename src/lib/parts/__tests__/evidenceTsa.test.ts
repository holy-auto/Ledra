import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({ fetchTimestamp: vi.fn() }));
vi.mock("@/lib/parts/rfc3161", () => ({ fetchTimestamp: mocks.fetchTimestamp }));

import { isEvidenceTsaEnabled, requestEvidenceTimestamp } from "../evidenceTsa";

const HASH = "a".repeat(64);
const saved = { ...process.env };

beforeEach(() => {
  mocks.fetchTimestamp.mockReset();
  process.env = { ...saved };
});
afterEach(() => {
  process.env = { ...saved };
});

describe("isEvidenceTsaEnabled", () => {
  it("false when disabled or URL missing", () => {
    delete process.env.PARTS_TSA_ENABLED;
    delete process.env.PARTS_TSA_URL;
    expect(isEvidenceTsaEnabled()).toBe(false);

    process.env.PARTS_TSA_ENABLED = "true";
    expect(isEvidenceTsaEnabled()).toBe(false); // still no URL

    process.env.PARTS_TSA_URL = "https://tsa.example.com";
    expect(isEvidenceTsaEnabled()).toBe(true);
  });
});

describe("requestEvidenceTimestamp", () => {
  it("returns null (no-op) when not enabled", async () => {
    delete process.env.PARTS_TSA_ENABLED;
    const r = await requestEvidenceTimestamp(HASH);
    expect(r).toBeNull();
    expect(mocks.fetchTimestamp).not.toHaveBeenCalled();
  });

  it("returns token/authority/timestampAt on success, using an isolated retryKey", async () => {
    process.env.PARTS_TSA_ENABLED = "true";
    process.env.PARTS_TSA_URL = "https://tsa.example.com";
    process.env.PARTS_TSA_AUTHORITY = "tsa.example.com";
    const token = Buffer.from("der-bytes");
    mocks.fetchTimestamp.mockResolvedValueOnce({ token, genTime: "2026-07-10T00:00:00.000Z" });

    const r = await requestEvidenceTimestamp(HASH);
    expect(r).toEqual({ token, authority: "tsa.example.com", timestampAt: "2026-07-10T00:00:00.000Z" });
    expect(mocks.fetchTimestamp).toHaveBeenCalledWith(
      "https://tsa.example.com",
      HASH,
      expect.objectContaining({ retryKey: "parts-evidence-tsa" }),
    );
  });

  it("derives authority from the URL host when PARTS_TSA_AUTHORITY is unset", async () => {
    process.env.PARTS_TSA_ENABLED = "true";
    process.env.PARTS_TSA_URL = "https://tsa.example.com/path";
    delete process.env.PARTS_TSA_AUTHORITY;
    mocks.fetchTimestamp.mockResolvedValueOnce({ token: Buffer.from("x"), genTime: "2026-07-10T00:00:00.000Z" });

    const r = await requestEvidenceTimestamp(HASH);
    expect(r?.authority).toBe("tsa.example.com");
  });

  it("fail-open: returns null when fetchTimestamp rejects (does not throw)", async () => {
    process.env.PARTS_TSA_ENABLED = "true";
    process.env.PARTS_TSA_URL = "https://tsa.example.com";
    mocks.fetchTimestamp.mockRejectedValueOnce(new Error("network down"));

    await expect(requestEvidenceTimestamp(HASH)).resolves.toBeNull();
  });

  it("fail-open: returns null when the request exceeds the deadline", async () => {
    vi.useFakeTimers();
    process.env.PARTS_TSA_ENABLED = "true";
    process.env.PARTS_TSA_URL = "https://tsa.example.com";
    mocks.fetchTimestamp.mockReturnValueOnce(new Promise(() => {})); // never resolves

    const p = requestEvidenceTimestamp(HASH);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toBeNull();
    vi.useRealTimers();
  });
});
