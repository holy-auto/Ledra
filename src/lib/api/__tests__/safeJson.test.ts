import { describe, it, expect, vi, afterEach } from "vitest";
import { safeJson } from "../safeJson";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("safeJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns parsed JSON on OK body", async () => {
    const res = jsonResponse({ hello: "world" });
    const j = await safeJson<{ hello: string }>(res, { fallback: { hello: "" }, context: "t" });
    expect(j).toEqual({ hello: "world" });
  });

  it("returns fallback when body is not JSON", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = textResponse("<!doctype html><html>oops</html>", 502);
    const j = await safeJson<null>(res, { fallback: null, context: "t" });
    expect(j).toBeNull();
  });

  it("returns fallback for 204 without calling .json()", async () => {
    const res = new Response(null, { status: 204 });
    const j = await safeJson<{ x: number }>(res, { fallback: { x: 0 }, context: "t" });
    expect(j).toEqual({ x: 0 });
  });

  it("returns fallback on non-ok when requireOk is set", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = jsonResponse({ error: "nope" }, 500);
    const j = await safeJson<{ error: string } | null>(res, {
      fallback: null,
      requireOk: true,
      context: "t",
    });
    expect(j).toBeNull();
  });

  it("parses JSON error envelope when requireOk is not set", async () => {
    const res = jsonResponse({ error: "bad_request" }, 400);
    const j = await safeJson<{ error?: string } | null>(res, { fallback: null, context: "t" });
    expect(j).toEqual({ error: "bad_request" });
  });
});
