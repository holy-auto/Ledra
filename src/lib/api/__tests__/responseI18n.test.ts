import { describe, it, expect } from "vitest";
import { apiValidationErrorT, apiUnauthorizedT, apiForbiddenT, apiNotFoundT } from "../responseI18n";

function reqWith(acceptLanguage: string): Request {
  return new Request("https://example.com", { headers: { "accept-language": acceptLanguage } });
}

async function bodyOf(res: Response): Promise<{ error: string; message: string }> {
  return (await res.json()) as { error: string; message: string };
}

describe("apiValidationErrorT", () => {
  it("translates the message based on Accept-Language (ja)", async () => {
    const res = apiValidationErrorT(reqWith("ja"), "errors.invalid_payload");
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.error).toBe("validation_error");
    expect(body.message).toBe("リクエスト内容が正しくありません。");
  });

  it("translates the message based on Accept-Language (en)", async () => {
    const res = apiValidationErrorT(reqWith("en-US"), "errors.invalid_payload");
    const body = await bodyOf(res);
    expect(body.message).toBe("Invalid request payload.");
  });

  it("interpolates vars", async () => {
    const res = apiValidationErrorT(reqWith("en"), "errors.missing_field", { field: "email" });
    const body = await bodyOf(res);
    expect(body.message).toBe("email is required.");
  });

  it("accepts a Locale directly", async () => {
    const res = apiValidationErrorT("ja", "errors.invalid_payload");
    const body = await bodyOf(res);
    expect(body.message).toBe("リクエスト内容が正しくありません。");
  });
});

describe("apiUnauthorizedT / apiForbiddenT / apiNotFoundT", () => {
  it("uses sensible default keys", async () => {
    expect(await bodyOf(apiUnauthorizedT("ja"))).toMatchObject({
      error: "unauthorized",
      message: "ログインが必要です。",
    });
    expect(await bodyOf(apiForbiddenT("ja"))).toMatchObject({
      error: "forbidden",
      message: "この操作を行う権限がありません。",
    });
    expect(await bodyOf(apiNotFoundT("ja"))).toMatchObject({
      error: "not_found",
      message: "対象が見つかりませんでした。",
    });
  });

  it("respects en accept-language", async () => {
    expect((await bodyOf(apiUnauthorizedT(reqWith("en")))).message).toBe("Authentication required.");
  });
});
