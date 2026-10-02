import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments, walkSource } from "@/lib/__tests__/sourceScan";

/**
 * GPSA O.5: Backend → 外部連携（Hive・Pinata・Polygon RPC）は、https 限定・TLS 1.3 未満を拒否する tls13HttpsFetch だけを通す。
 * 素の fetch や fetchFn 無しの viem トランスポートが戻ると TLS 1.2 で話せてしまうので、ここで止める。
 * tls13Fetch 自体が 1.2 を拒否することは src/lib/net/__tests__/tls13Fetch.test.ts が実ハンドシェイクで見ている。
 *
 * ponytail: 字面の走査。別モジュール経由の呼び出し（photoTsa → parts/rfc3161 の fetch）は見えない。
 * TSA は本番で無効かつ GPSA の連携一覧に無いので対象外（OPEN_QUESTIONS）。有効にするなら rfc3161 を tls13HttpsFetch へ。
 */
const SRC = join(__dirname, "../../..");
const read = (f: string) => stripComments(readFileSync(f, "utf8"), f);
const name = (f: string) => f.slice(SRC.length + 1);

const BARE_FETCH = /(?:^|[^\w.]|globalThis\.)fetch\s*\(/gm;
const VIEM_TRANSPORT = /(?<![\w.])(?:http|webSocket|fallback)\s*\([^)]*\)/g;
const PINNED = /fetchFn:\s*tls13HttpsFetch\b/;
const HTTP_ALLOWED = /(?<![\w.])tls13Fetch\s*\(/g; // http も通す版。連携には使わない

const providers = walkSource(join(SRC, "lib/anchoring/providers"));
const viemUsers = walkSource(SRC).filter((f) => /from "viem|import\("viem/.test(read(f)));

describe("integrations reach the network only through tls13HttpsFetch", () => {
  it("scans the modules that call integrations", () => {
    expect(providers.map(name)).toEqual(
      expect.arrayContaining(["lib/anchoring/providers/deepfake.ts", "lib/anchoring/providers/c2pa.ts"]),
    );
    expect(viemUsers.map(name)).toEqual(
      expect.arrayContaining([
        "lib/anchoring/providers/polygon.ts",
        "lib/anchoring/providers/polygonBatch.ts",
        "app/api/cron/polygon-signer/route.ts",
      ]),
    );
  });

  it("detects the bypasses it is meant to catch", () => {
    for (const s of ['await fetch("u")', 'await globalThis.fetch("u")', 'fetch ("u")']) {
      expect(s.match(BARE_FETCH)).toHaveLength(1);
    }
    expect('await tls13HttpsFetch("u")'.match(BARE_FETCH)).toBeNull();
    expect('await tls13Fetch("u")'.match(HTTP_ALLOWED)).toHaveLength(1);
    expect('await tls13HttpsFetch("u")'.match(HTTP_ALLOWED)).toBeNull();
    for (const s of ["http(url)", "webSocket(url)", "http(url, { fetchFn: tls13Fetch })"]) {
      expect((s.match(VIEM_TRANSPORT) ?? []).filter((c) => !PINNED.test(c))).toHaveLength(1);
    }
    expect("http(url, { fetchFn:tls13HttpsFetch })".match(VIEM_TRANSPORT)?.every((c) => PINNED.test(c))).toBe(true);
  });

  it.each(providers.map((f) => [name(f), f]))("no bare fetch in %s", (_n, file) => {
    const src = read(file as string);
    expect(src.match(BARE_FETCH) ?? []).toEqual([]);
    expect(src.match(HTTP_ALLOWED) ?? []).toEqual([]);
  });

  it.each(viemUsers.map((f) => [name(f), f]))("every viem transport is pinned in %s", (_n, file) => {
    expect((read(file as string).match(VIEM_TRANSPORT) ?? []).filter((c) => !PINNED.test(c))).toEqual([]);
  });
});
