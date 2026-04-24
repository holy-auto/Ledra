import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseJsonSafe, safeFetchJson, safeJson } from "../safeJson";

// Silence the logger during tests
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

describe("parseJsonSafe", () => {
  it("returns parsed JSON on success", async () => {
    const res = new Response(JSON.stringify({ foo: "bar" }));
    const data = await parseJsonSafe<{ foo: string }>(res);
    expect(data).toEqual({ foo: "bar" });
  });

  it("returns null when body is invalid JSON", async () => {
    const res = new Response("<html>not json</html>");
    const data = await parseJsonSafe(res);
    expect(data).toBeNull();
  });

  it("returns null when body is empty", async () => {
    const res = new Response("");
    const data = await parseJsonSafe(res);
    expect(data).toBeNull();
  });

  it("preserves generic type narrowing", async () => {
    type Foo = { value: number };
    const res = new Response(JSON.stringify({ value: 42 }));
    const data = await parseJsonSafe<Foo>(res);
    expect(data?.value).toBe(42);
  });
});

describe("safeFetchJson", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true + data on 200 with JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ hello: "world" }), { status: 200 })),
    );
    const result = await safeFetchJson<{ hello: string }>("/api/foo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ hello: "world" });
    }
  });

  it("returns ok:false + non_ok on 500 with JSON error body (body still exposed)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "boom" }), { status: 500 })));
    const result = await safeFetchJson<{ error: string }>("/api/foo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("non_ok");
      expect(result.status).toBe(500);
      expect(result.data).toEqual({ error: "boom" });
    }
  });

  it("returns ok:false + parse on HTML error page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502 Bad Gateway</html>", { status: 502 })));
    const result = await safeFetchJson("/api/foo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("parse");
      expect(result.data).toBeNull();
      expect(result.status).toBe(502);
    }
  });

  it("returns ok:false + network on fetch rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed to fetch")));
    const result = await safeFetchJson("/api/foo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("network");
      expect(result.status).toBe(0);
      expect(result.error.message).toMatch(/failed to fetch/);
    }
  });

  it("treats 204 No Content as success with null body (not a parse error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const result = await safeFetchJson("/api/foo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(204);
      expect(result.data).toBeNull();
    }
  });

  it("treats 205 Reset Content as success with null body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 205 })));
    const result = await safeFetchJson("/api/foo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe(205);
      expect(result.data).toBeNull();
    }
  });
});

describe("safeJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns parsed JSON on OK body", async () => {
    const res = jsonResponse({ hello: "world" });
    const j = await safeJson<{ hello: string }>(res, { fallback: { hello: "" }, context: "t" });
    expect(j).toEqual({ hello: "world" });
  });

  it("returns fallback when body is not JSON", async () => {
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
