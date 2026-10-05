import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireNative } from "../../__tests__/nativeImaging";
import { collectFailureCodes } from "./c2paFailureCodes";

/**
 * Claim signatures carry an RFC 3161 time-stamp when C2PA_TSA_URL is set, and a TSA that fails or
 * never answers costs at most C2PA_TSA_TIMEOUT_MS before the photo is signed without one.
 * The TSA is a local openssl one (the public TSAs are out of reach from CI and the sandbox).
 */

// The local TSA speaks plain http, which tls13HttpsFetch refuses; pass it through to fetch, and
// record the calls to show the request went through the TLS 1.3 helper rather than c2pa-rs.
const tls13HttpsFetch = vi.hoisted(() => vi.fn((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)));
vi.mock("@/lib/net/tls13Fetch", () => ({ tls13HttpsFetch, tls13Fetch: tls13HttpsFetch }));

const d = mkdtempSync(join(tmpdir(), "c2pa-tsa-"));
const f = (n: string) => join(d, n);
const ossl = (...a: string[]) => execFileSync("openssl", a, { stdio: ["ignore", "ignore", "pipe"] });
const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

type C2paReader = { fromAsset(input: { buffer: Buffer; mimeType: string }): Promise<{ json(): unknown } | null> };
let Reader: C2paReader;
let jpeg: Buffer;
const servers: Server[] = [];
let stampingTsa: string;
let silentTsa: string;
let failingTsa: string;
const mode = process.env.C2PA_MODE;
const tsaEnv = process.env.C2PA_TSA_URL;

beforeAll(async () => {
  writeFileSync(
    f("ext.cnf"),
    `[ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
[tsa]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,nonRepudiation
extendedKeyUsage=critical,timeStamping
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
`,
  );
  for (const [name, ext, ca] of [
    ["tsaroot", "ca", undefined],
    ["tsa", "tsa", "tsaroot"],
  ] as const) {
    ossl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", f(`${name}.key`));
    ossl("req", "-new", "-key", f(`${name}.key`), "-subj", `/O=Ledra test/CN=${name}`, "-out", f(`${name}.csr`));
    const signer = ca ? ["-CA", f(`${ca}.pem`), "-CAkey", f(`${ca}.key`)] : ["-key", f(`${name}.key`)];
    ossl(
      "x509",
      "-req",
      "-in",
      f(`${name}.csr`),
      ...signer,
      "-days",
      "30",
      "-extfile",
      f("ext.cnf"),
      "-extensions",
      ext,
      "-out",
      f(`${name}.pem`),
    );
  }
  writeFileSync(f("serial"), "01\n");
  writeFileSync(
    f("tsa.cnf"),
    `[tsa]
default_tsa=t
[t]
serial=${f("serial")}
signer_cert=${f("tsa.pem")}
signer_key=${f("tsa.key")}
signer_digest=sha256
default_policy=1.2.3.4.1
digests=sha256,sha384,sha512
ess_cert_id_alg=sha256
`,
  );
  const stamping = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      writeFileSync(f("q.tsq"), Buffer.concat(chunks));
      ossl("ts", "-reply", "-config", f("tsa.cnf"), "-queryfile", f("q.tsq"), "-out", f("r.tsr"));
      res.writeHead(200, { "content-type": "application/timestamp-reply" }).end(readFileSync(f("r.tsr")));
    });
  });
  const silent = createServer(() => {});
  const failing = createServer((_req, res) => res.writeHead(503).end());
  servers.push(stamping, silent, failing);
  [stampingTsa, silentTsa, failingTsa] = await Promise.all(servers.map(listen));

  const sharp = (await requireNative(() => import("sharp"), "sharp")).default;
  Reader = (await requireNative(() => import("@contentauth/c2pa-node"), "@contentauth/c2pa-node"))
    .Reader as unknown as C2paReader;
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#468" } })
    .jpeg()
    .toBuffer();
  process.env.C2PA_MODE = "dev-signed";
}, 30_000);

afterAll(() => {
  for (const s of servers) {
    s.closeAllConnections();
    s.close();
  }
  if (mode === undefined) delete process.env.C2PA_MODE;
  else process.env.C2PA_MODE = mode;
  if (tsaEnv === undefined) delete process.env.C2PA_TSA_URL;
  else process.env.C2PA_TSA_URL = tsaEnv;
});

beforeEach(() => {
  tls13HttpsFetch.mockClear();
});

async function sign(tsaUrl: string | undefined) {
  if (tsaUrl) process.env.C2PA_TSA_URL = tsaUrl;
  else delete process.env.C2PA_TSA_URL;
  const { signC2pa } = await import("../c2pa");
  const started = Date.now();
  const res = await signC2pa(jpeg, "image/jpeg");
  expect(res.failure).toBeNull();
  const raw = (await Reader.fromAsset({ buffer: res.signedBuffer!, mimeType: "image/jpeg" }))!.json();
  const store = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
    active_manifest: string;
    manifests: Record<string, { signature_info?: { time?: string } }>;
    validation_results?: { activeManifest?: { success?: { code: string }[] } };
  };
  return {
    ms: Date.now() - started,
    time: store.manifests[store.active_manifest].signature_info?.time,
    codes: (store.validation_results?.activeManifest?.success ?? []).map((s) => s.code),
    failures: [...collectFailureCodes(store as unknown as Record<string, unknown>)].sort(),
  };
}

describe("C2PA claim signature time-stamp", () => {
  it("stamps the signature through the TLS 1.3 helper when C2PA_TSA_URL is set", async () => {
    const r = await sign(stampingTsa);
    expect(r.time).toBeTruthy();
    expect(r.codes).toContain("timeStamp.validated");
    expect(tls13HttpsFetch).toHaveBeenCalledWith(stampingTsa, expect.objectContaining({ method: "POST" }));
  }, 20_000);

  it("signs without a time-stamp when C2PA_TSA_URL is unset", async () => {
    const r = await sign(undefined);
    expect(r.time).toBeUndefined();
    expect(tls13HttpsFetch).not.toHaveBeenCalled();
  }, 20_000);

  it.each([
    ["fails", () => failingTsa],
    ["never answers", () => silentTsa],
  ])(
    "still signs, without a time-stamp and within the TSA budget, when the TSA %s",
    async (_case, url) => {
      const { C2PA_TSA_TIMEOUT_MS } = await import("../c2paSigner");
      const r = await sign(url());
      expect(r.time).toBeUndefined();
      expect(r.ms).toBeLessThan(C2PA_TSA_TIMEOUT_MS + 3_000);
      // The fallback reuses the builder the failed attempt used; it must validate like a plain signing.
      expect(r.failures).toEqual((await sign(undefined)).failures);
    },
    20_000,
  );
});
