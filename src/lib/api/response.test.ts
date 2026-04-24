import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// NextResponse をモック (headers を exposure できるように拡張)
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: new Map(Object.entries(init?.headers ?? {})),
    }),
  },
}));

// logger をモック — auditResponseBodyForSecrets が warn を呼ぶ
const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: (msg: string, ctx?: unknown) => loggerWarn(msg, ctx),
    error: vi.fn(),
    child: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import {
  apiError,
  apiOk,
  apiJson,
  apiInternalError,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiPlanLimit,
  applySecurityHeaders,
  auditResponseBodyForSecrets,
  redactScopeIds,
} from "./response";

// ─── apiOk ───
describe("apiOk", () => {
  it("ok: true を含むレスポンスを返す", () => {
    const res = apiOk({ user_id: "123" }) as any;
    expect(res.body.ok).toBe(true);
    expect(res.body.user_id).toBe("123");
    expect(res.status).toBe(200);
  });

  it("カスタムステータスコードを指定できる", () => {
    const res = apiOk({ id: "abc" }, 201) as any;
    expect(res.status).toBe(201);
  });
});

// ─── apiError ───
describe("apiError", () => {
  it("エラーコードとメッセージを含むレスポンスを返す", () => {
    const res = apiError({
      code: "validation_error",
      message: "入力が不正です",
      status: 400,
    }) as any;
    expect(res.body.error).toBe("validation_error");
    expect(res.body.message).toBe("入力が不正です");
    expect(res.status).toBe(400);
  });

  it("追加データを含められる", () => {
    const res = apiError({
      code: "plan_limit",
      message: "上限です",
      status: 403,
      data: { limit: 5, current: 5 },
    }) as any;
    expect(res.body.limit).toBe(5);
    expect(res.body.current).toBe(5);
  });
});

// ─── apiUnauthorized ───
describe("apiUnauthorized", () => {
  it("401を返す", () => {
    const res = apiUnauthorized() as any;
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("カスタムメッセージを指定できる", () => {
    const res = apiUnauthorized("ログインしてください") as any;
    expect(res.body.message).toBe("ログインしてください");
  });
});

// ─── apiForbidden ───
describe("apiForbidden", () => {
  it("403を返す", () => {
    const res = apiForbidden() as any;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });
});

// ─── apiValidationError ───
describe("apiValidationError", () => {
  it("400を返す", () => {
    const res = apiValidationError("メールが不正です") as any;
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
    expect(res.body.message).toBe("メールが不正です");
  });
});

// ─── apiNotFound ───
describe("apiNotFound", () => {
  it("404を返す", () => {
    const res = apiNotFound() as any;
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});

// ─── apiPlanLimit ───
describe("apiPlanLimit", () => {
  it("403を返す", () => {
    const res = apiPlanLimit("メンバー上限に達しています", { limit: 5 }) as any;
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("plan_limit");
    expect(res.body.limit).toBe(5);
  });
});

// ─── apiInternalError ───
describe("apiInternalError", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("500を返す", () => {
    const res = apiInternalError(new Error("DB connection failed")) as any;
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal_error");
  });

  it("コンテキスト付きでエラーログを出力する", () => {
    apiInternalError(new Error("test error"), "signup");
    expect(consoleSpy).toHaveBeenCalledWith("[API Error] signup:", "test error");
  });

  it("Error以外のオブジェクトも処理できる", () => {
    const res = apiInternalError("string error") as any;
    expect(res.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("開発環境ではエラー詳細を含む", () => {
    // NODE_ENV=test（非production）なので詳細が含まれる
    const res = apiInternalError(new Error("secret info")) as any;
    expect(res.body.message).toContain("secret info");
  });
});

// ─── Security headers (Cache-Control / Vary) ───
describe("default security headers", () => {
  it("apiOk sets private no-store Cache-Control by default", () => {
    const res = apiOk({ foo: "bar" }) as any;
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("vary")).toBe("Cookie");
  });

  it("apiOk sets noindex + Pragma defense-in-depth headers", () => {
    const res = apiOk({ foo: "bar" }) as any;
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("pragma")).toBe("no-cache");
  });

  it("apiOk allows cacheControl override", () => {
    const res = apiOk({ foo: "bar" }, 200, { cacheControl: "private, max-age=10" }) as any;
    expect(res.headers.get("cache-control")).toBe("private, max-age=10");
  });

  it("apiError also sets private no-store Cache-Control", () => {
    const res = apiError({ code: "validation_error", message: "bad", status: 400 }) as any;
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("apiJson sets private no-store by default, without ok wrapping", () => {
    const res = apiJson({ raw: "payload" }) as any;
    expect(res.body).toEqual({ raw: "payload" }); // no ok:true wrap
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("apiJson merges extra headers", () => {
    const res = apiJson({ x: 1 }, { status: 429, headers: { "Retry-After": "60" } }) as any;
    expect(res.status).toBe(429);
    // Map mock preserves exact key casing
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
  });

  it("applySecurityHeaders is a no-op when header already set", () => {
    // Simulate a response that already sets Cache-Control
    const pre = {
      headers: {
        has: (k: string) => k === "cache-control",
        set: vi.fn(),
      },
    } as any;
    applySecurityHeaders(pre);
    // Cache-Control should not be re-set; Vary should
    const setCalls = pre.headers.set.mock.calls as string[][];
    const keys = setCalls.map((c) => c[0]);
    expect(keys).not.toContain("cache-control");
    expect(keys).toContain("vary");
  });
});

// ─── auditResponseBodyForSecrets ───
describe("auditResponseBodyForSecrets", () => {
  beforeEach(() => {
    loggerWarn.mockClear();
  });

  it("emits a warn when body has a secret-shaped key", () => {
    auditResponseBodyForSecrets({ user_id: "abc", password_hash: "xyz" }, "test.route");
    expect(loggerWarn).toHaveBeenCalledOnce();
    const ctx = loggerWarn.mock.calls[0][1] as { route: string; leaked_paths: string[] };
    expect(ctx.leaked_paths).toEqual(["password_hash"]);
    expect(ctx.route).toBe("test.route");
  });

  it("detects nested secrets", () => {
    auditResponseBodyForSecrets({ tenant: { id: "t1", webhook_secret: "wss..." } });
    expect(loggerWarn).toHaveBeenCalledOnce();
    const ctx = loggerWarn.mock.calls[0][1] as { leaked_paths: string[] };
    expect(ctx.leaked_paths).toContain("tenant.webhook_secret");
  });

  it("does not warn on allowlisted keys (sign_token, session_token)", () => {
    auditResponseBodyForSecrets({ sign_token: "abc", session_token: "xyz" });
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("does not warn on benign keys", () => {
    auditResponseBodyForSecrets({ id: "123", name: "foo", created_at: "2024-01-01" });
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("apiOk auto-audits data on 200 responses", () => {
    apiOk({ service_role_key: "leaked!" });
    expect(loggerWarn).toHaveBeenCalledOnce();
  });

  it("apiJson auto-audits body", () => {
    apiJson({ api_key: "sk_live_xxx" });
    expect(loggerWarn).toHaveBeenCalledOnce();
  });
});

// ─── redactScopeIds ───
describe("redactScopeIds", () => {
  it("strips tenant_id / insurer_id / user_id by default", () => {
    const body = {
      tenant_id: "tnt-1",
      insurer_id: "ins-1",
      user_id: "usr-1",
      customer_id: "cus-1", // preserved (not a caller-scope id)
      value: 42,
    };
    expect(redactScopeIds(body)).toEqual({ customer_id: "cus-1", value: 42 });
  });

  it("recursively strips from nested arrays / objects", () => {
    const body = {
      orders: [
        { id: "o1", tenant_id: "t1", customer_id: "c1" },
        { id: "o2", tenant_id: "t1", customer_id: "c2" },
      ],
      meta: { tenant_id: "t1", pages: 2 },
    };
    expect(redactScopeIds(body)).toEqual({
      orders: [
        { id: "o1", customer_id: "c1" },
        { id: "o2", customer_id: "c2" },
      ],
      meta: { pages: 2 },
    });
  });

  it("respects keep allowlist", () => {
    const body = { tenant_id: "t1", user_id: "u1", data: 1 };
    expect(redactScopeIds(body, { keep: ["tenant_id"] })).toEqual({
      tenant_id: "t1",
      data: 1,
    });
  });

  it("honors custom keys override", () => {
    const body = { stripe_customer_id: "cus_x", customer_id: "c1", id: 1 };
    expect(redactScopeIds(body, { keys: ["stripe_customer_id"] })).toEqual({
      customer_id: "c1",
      id: 1,
    });
  });

  it("is a no-op on primitives", () => {
    expect(redactScopeIds("hello")).toBe("hello");
    expect(redactScopeIds(42)).toBe(42);
    expect(redactScopeIds(null)).toBeNull();
  });
});
