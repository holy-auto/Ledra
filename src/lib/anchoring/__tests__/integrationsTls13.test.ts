import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments, walkSource } from "@/lib/__tests__/sourceScan";

/**
 * GPSA O.5: Backend → 外部連携（Hive・Pinata・Polygon RPC）は、TLS 1.3 未満を拒否する tls13Fetch だけを通す。
 * 素の fetch や fetchFn 無しの viem トランスポートが戻ると TLS 1.2 で話せてしまうので、ここで止める。
 * tls13Fetch 自体が 1.2 を拒否することは src/lib/net/__tests__/tls13Fetch.test.ts が実ハンドシェイクで見ている。
 *
 * ponytail: 字面の走査。別モジュール経由の呼び出し（photoTsa → parts/rfc3161 の fetch）は見えない。
 * TSA は本番で無効かつ GPSA の連携一覧に無いので対象外（OPEN_QUESTIONS）。有効にするなら rfc3161 を tls13Fetch へ。
 */
const SRC = join(__dirname, "../../..");
const read = (f: string) => stripComments(readFileSync(f, "utf8"), f);
const name = (f: string) => f.slice(SRC.length + 1);

const BARE_FETCH = /(?:^|[^\w.]|globalThis\.)fetch\s*\(/gm;
const VIEM_TRANSPORT = /(?<![\w.])(?:http|webSocket|fallback)\s*\([^)]*\)/g;
const PINNED = /fetchFn:\s*tls13Fetch\b/;

const providers = walkSource(join(SRC, "lib/anchoring/providers"));
const viemUsers = walkSource(SRC).filter((f) => /from "viem|import\("viem/.test(read(f)));

describe("integrations reach the network only through tls13Fetch", () => {
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
    expect('await tls13Fetch("u")'.match(BARE_FETCH)).toBeNull();
    for (const s of ["http(url)", "webSocket(url)", "http(url, { fetchFn: tls13FetchX })"]) {
      expect((s.match(VIEM_TRANSPORT) ?? []).filter((c) => !PINNED.test(c))).toHaveLength(1);
    }
    expect("http(url, { fetchFn:tls13Fetch })".match(VIEM_TRANSPORT)?.every((c) => PINNED.test(c))).toBe(true);
  });

  it.each(providers.map((f) => [name(f), f]))("no bare fetch in %s", (_n, file) => {
    expect(read(file as string).match(BARE_FETCH) ?? []).toEqual([]);
  });

  it.each(viemUsers.map((f) => [name(f), f]))("every viem transport is pinned in %s", (_n, file) => {
    expect((read(file as string).match(VIEM_TRANSPORT) ?? []).filter((c) => !PINNED.test(c))).toEqual([]);
  });
});
