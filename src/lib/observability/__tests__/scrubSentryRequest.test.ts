import { describe, it, expect } from "vitest";
import { scrubSentryRequestHeaders } from "../scrubSentryRequest";

describe("scrubSentryRequestHeaders", () => {
  it("authorization / cookie ヘッダを削除する", () => {
    const event = {
      request: {
        headers: {
          Authorization: "Bearer super-secret-token",
          Cookie: "session=abc123",
          "User-Agent": "test-agent",
        },
      },
    };
    const result = scrubSentryRequestHeaders(event);
    expect(result.request?.headers).toEqual({ "User-Agent": "test-agent" });
  });

  it("大文字小文字違い（authorization / cookie 小文字）も削除する", () => {
    const event = {
      request: {
        headers: {
          authorization: "Bearer x",
          cookie: "a=b",
          "set-cookie": "c=d",
          "proxy-authorization": "Basic y",
          Accept: "application/json",
        },
      },
    };
    const result = scrubSentryRequestHeaders(event);
    expect(result.request?.headers).toEqual({ Accept: "application/json" });
  });

  it("request / headers が無いイベントでも例外を投げない", () => {
    expect(() => scrubSentryRequestHeaders({})).not.toThrow();
    expect(() => scrubSentryRequestHeaders({ request: {} })).not.toThrow();
    expect(() => scrubSentryRequestHeaders({ request: { headers: null } })).not.toThrow();
  });

  it("引数の event 自体（同じオブジェクト）を返す", () => {
    const event = { request: { headers: { authorization: "x" } } };
    const result = scrubSentryRequestHeaders(event);
    expect(result).toBe(event);
  });
});
