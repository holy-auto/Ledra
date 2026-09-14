import { afterEach, describe, expect, it, vi } from "vitest";
import { withQstashSignature } from "../verifySignature";

describe("withQstashSignature", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("署名鍵が無い環境ではハンドラを実行せず503を返す", async () => {
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const handler = vi.fn(async () => Response.json({ ok: true }));

    const response = await withQstashSignature(handler)(new Request("https://app.example.com/api/qstash/test"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "service_unavailable" });
    expect(handler).not.toHaveBeenCalled();
  });
});
