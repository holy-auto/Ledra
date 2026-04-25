import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger, maskEmail, resolveRequestId } from "../logger";

let spy: ReturnType<typeof vi.spyOn>;

function lastCall(): Record<string, unknown> {
  const args = spy.mock.calls.at(-1);
  if (!args || typeof args[0] !== "string") throw new Error("no log emitted");
  return JSON.parse(args[0] as string) as Record<string, unknown>;
}

describe("logger", () => {
  beforeEach(() => {
    spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("emits structured JSON with level + msg + ts", () => {
    logger.info("hello", { foo: "bar" });
    const rec = lastCall();
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(rec.foo).toBe("bar");
    expect(typeof rec.ts).toBe("string");
  });

  it("masks secret-looking keys", () => {
    logger.info("auth", { api_key: "abcdef1234567890", other: "public" });
    const rec = lastCall();
    expect(rec.api_key).not.toBe("abcdef1234567890");
    expect(String(rec.api_key)).toContain("***");
    expect(rec.other).toBe("public");
  });

  it("masks short secrets as ***", () => {
    logger.info("auth", { password: "short" });
    const rec = lastCall();
    expect(rec.password).toBe("***");
  });

  it("masks nested secret keys", () => {
    logger.info("nested", { creds: { access_token: "xxxxxxxxxxxx" } });
    const rec = lastCall();
    expect(JSON.stringify(rec.creds)).toContain("***");
  });

  it("child() merges context", () => {
    const child = logger.child({ tenantId: "t1", requestId: "r1" });
    child.info("child log");
    const rec = lastCall();
    expect(rec.tenantId).toBe("t1");
    expect(rec.requestId).toBe("r1");
  });

  it("serializes Error objects with name/message/stack", () => {
    const errSpy = vi.spyOn(console, "error");
    logger.error("boom", new Error("kaboom"));
    const rec = JSON.parse(errSpy.mock.calls.at(-1)?.[0] as string) as {
      error: { name: string; message: string; stack?: string };
    };
    expect(rec.error.name).toBe("Error");
    expect(rec.error.message).toBe("kaboom");
    expect(typeof rec.error.stack).toBe("string");
  });
});

describe("maskEmail", () => {
  it("keeps first two local chars and the domain", () => {
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
  });
  it("collapses single-char locals", () => {
    expect(maskEmail("x@y.com")).toBe("x***@y.com");
  });
  it("returns *** for null / empty / malformed", () => {
    expect(maskEmail(null)).toBe("***");
    expect(maskEmail(undefined)).toBe("***");
    expect(maskEmail("")).toBe("***");
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@no-local.com")).toBe("***");
  });
});

describe("resolveRequestId", () => {
  it("uses x-request-id when present and valid", () => {
    const req = { headers: new Headers({ "x-request-id": "abcd1234efgh" }) };
    expect(resolveRequestId(req)).toBe("abcd1234efgh");
  });
  it("falls back to x-vercel-id", () => {
    const req = { headers: new Headers({ "x-vercel-id": "iad1::vcl-deadbeef" }) };
    expect(resolveRequestId(req)).toBe("iad1::vcl-deadbeef");
  });
  it("rejects suspicious headers and generates a new id", () => {
    const req = { headers: new Headers({ "x-request-id": "abc def ghi" }) };
    const id = resolveRequestId(req);
    expect(id).not.toBe("abc def ghi");
    expect(id.length).toBeGreaterThanOrEqual(8);
  });
});
