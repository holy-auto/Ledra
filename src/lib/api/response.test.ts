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
