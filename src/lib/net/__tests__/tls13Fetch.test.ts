import { createServer as createHttpServer } from "node:http";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateDevCert } from "@/lib/anchoring/providers/c2paSigner";
import { tls13Fetch } from "../tls13Fetch";

/**
 * tls13Fetch が TLS 1.2 止まりの相手を拒否し、1.3 の相手とは版の交渉を通ることを実ハンドシェイクで確かめる。
 * 証明書検証は本番と同じ Agent のまま（無効化しない）ので、1.3 側は証明書で落ちる（C2PA 用の開発証明書を
 * 流用しているので、自己署名または用途違い＝INVALID_PURPOSE）。
 * 1.2 側は「版」で、1.3 側は「証明書」で落ちる —— 失敗理由（エラーの cause）で区別する。
 *
 * 併せて、Supabase Storage が送る形の本文（組み込み FormData + Blob、Request 入力）が壊れずに届くことを見る。
 * undici パッケージの fetch を使っていた版は multipart を "[object FormData]" に化けさせていた。
 */
function listen(opts: { cert: string; key: string; maxVersion: "TLSv1.2" | "TLSv1.3" }): Promise<Server> {
  const server = createServer(opts, (_req, res) => res.end("ok"));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function causeOf(url: string): Promise<string> {
  try {
    await tls13Fetch(url);
    return "connected";
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return `${cause?.code ?? ""} ${cause?.message ?? ""}`;
  }
}

describe("tls13Fetch", () => {
  let tls12: Server;
  let tls13: Server;
  const url = (s: { address(): unknown }, scheme = "https") =>
    `${scheme}://127.0.0.1:${(s.address() as AddressInfo).port}/`;

  beforeAll(async () => {
    const { certPem: cert, keyPem: key } = await generateDevCert();
    tls12 = await listen({ cert, key, maxVersion: "TLSv1.2" });
    tls13 = await listen({ cert, key, maxVersion: "TLSv1.3" });
  });
  afterAll(() => {
    tls12?.close();
    tls13?.close();
  });

  it("refuses a server that only speaks TLS 1.2 (protocol version, not certificate)", async () => {
    const why = await causeOf(url(tls12));
    expect(why).toMatch(/protocol version|UNSUPPORTED_PROTOCOL|TLSV1_ALERT_PROTOCOL_VERSION/i);
  });

  it("negotiates past the version check with a TLS 1.3 server (fails only on the certificate)", async () => {
    const why = await causeOf(url(tls13));
    expect(why).not.toMatch(/protocol version|UNSUPPORTED_PROTOCOL/i);
    expect(why).toMatch(/self[- ]signed|DEPTH_ZERO_SELF_SIGNED_CERT|INVALID_PURPOSE|certificate/i);
  });

  it("sends built-in FormData/Blob and Request bodies intact (Storage upload shape)", async () => {
    const echo = createHttpServer((req, res) => {
      let len = 0;
      req.on("data", (c: Buffer) => (len += c.length));
      req.on("end", () => res.end(JSON.stringify({ ct: req.headers["content-type"], len })));
    });
    await new Promise<void>((r) => echo.listen(0, "127.0.0.1", r));
    try {
      const fd = new FormData();
      fd.append("file", new Blob([new Uint8Array(1000)], { type: "image/jpeg" }), "a.jpg");
      const multipart = await (await tls13Fetch(url(echo, "http"), { method: "POST", body: fd })).json();
      expect(multipart.ct).toMatch(/^multipart\/form-data; boundary=/);
      expect(multipart.len).toBeGreaterThan(1000);

      const viaRequest = await (
        await tls13Fetch(new Request(url(echo, "http"), { method: "POST", body: "abc" }))
      ).json();
      expect(viaRequest.len).toBe(3);
    } finally {
      echo.close();
    }
  });
});
