import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments, walkSource } from "@/lib/__tests__/sourceScan";

/**
 * GPSA O.5: Backend → 外部連携（Hive・Pinata・Polygon RPC）は、TLS 1.3 未満を拒否する tls13Fetch だけを通す。
 * 素の fetch や fetchFn 無しの viem http() が providers に戻ると TLS 1.2 で話せてしまうので、ここで止める。
 * tls13Fetch 自体が 1.2 を拒否することは src/lib/net/__tests__/tls13Fetch.test.ts が実ハンドシェイクで見ている。
 */
const files = walkSource(join(__dirname, "../providers"));
const BARE_FETCH = /(?<![\w.])fetch\(/g;
const VIEM_HTTP = /(?<![\w.])http\([^)]*\)/g;

describe("anchoring providers reach integrations only through tls13Fetch", () => {
  it("scans the provider modules", () => {
    expect(files.map((f) => f.split("/").pop())).toEqual(
      expect.arrayContaining(["deepfake.ts", "c2pa.ts", "polygon.ts", "polygonBatch.ts"]),
    );
  });

  it("detects a bare fetch and an unpinned viem transport", () => {
    expect('await fetch("https://x")'.match(BARE_FETCH)).toHaveLength(1);
    expect("transport: http(config.rpcUrl)".match(VIEM_HTTP)).toHaveLength(1);
    expect('await tls13Fetch("https://x")'.match(BARE_FETCH)).toBeNull();
  });

  it.each(files.map((f) => [f.split("/").pop(), f]))("%s", (_name, file) => {
    const src = stripComments(readFileSync(file as string, "utf8"), file as string);
    expect(src.match(BARE_FETCH) ?? []).toEqual([]);
    expect((src.match(VIEM_HTTP) ?? []).filter((call) => !call.includes("fetchFn: tls13Fetch"))).toEqual([]);
  });
});
