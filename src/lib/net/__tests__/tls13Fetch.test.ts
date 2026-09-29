import "reflect-metadata";
import { createServer, type Server } from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tls13Fetch } from "../tls13Fetch";

/**
 * tls13Fetch が TLS 1.2 止まりの相手を拒否し、1.3 の相手とは版の交渉を通ることを実ハンドシェイクで確かめる。
 * 証明書検証は本番と同じ Agent のまま（無効化しない）ので、自己署名の 1.3 側は証明書で落ちる。
 * 1.2 側は「版」で、1.3 側は「証明書」で落ちる —— 失敗理由（エラーの cause）で区別する。
 */
async function selfSigned(): Promise<{ cert: string; key: string }> {
  const { Crypto } = await import("@peculiar/webcrypto");
  const x509 = await import("@peculiar/x509");
  const crypto = new Crypto();
  x509.cryptoProvider.set(crypto);
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=localhost",
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 3_600_000),
    keys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
  });
  const der = Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64");
  const key = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
  return { cert: cert.toString("pem"), key };
}

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
  const url = (s: Server) => `https://127.0.0.1:${(s.address() as AddressInfo).port}/`;

  beforeAll(async () => {
    const pair = await selfSigned();
    tls12 = await listen({ ...pair, maxVersion: "TLSv1.2" });
    tls13 = await listen({ ...pair, maxVersion: "TLSv1.3" });
  });
  afterAll(() => {
    tls12?.close();
    tls13?.close();
  });

  it("refuses a server that only speaks TLS 1.2 (protocol version, not certificate)", async () => {
    const why = await causeOf(url(tls12));
    expect(why).toMatch(/protocol version|UNSUPPORTED_PROTOCOL|TLSV1_ALERT_PROTOCOL_VERSION/i);
  });

  it("negotiates past the version check with a TLS 1.3 server (fails only on the self-signed cert)", async () => {
    const why = await causeOf(url(tls13));
    expect(why).not.toMatch(/protocol version|UNSUPPORTED_PROTOCOL/i);
    expect(why).toMatch(/self[- ]signed|DEPTH_ZERO_SELF_SIGNED_CERT/i);
  });
});
