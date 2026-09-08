/**
 * F-10 是正 (2026-09-08): admin/certificates の export 系 3 ルート +
 * insurer/export-one が、`src/lib/csv/serialize.ts` の csvEscape とは別に
 * ローカルで csvEscape を再定義していた。しかもローカル版はどれも
 * formula injection 対策（先頭 `=+-@` 文字のシングルクォート前置）を
 * 持っていなかった — 重複そのものより、この非対称なセキュリティ差分が
 * 実害だった。
 *
 * `@/lib/csv/serialize` に一本化した後、同じパターンが再発しないことを
 * ソース走査で固定する。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkSource } from "../../__tests__/sourceScan";

const SRC_ROOT = join(process.cwd(), "src");

describe("csvEscape の再定義を防ぐ", () => {
  it("src/lib/csv/serialize.ts 以外に csvEscape のローカル定義が無い", () => {
    const offenders: string[] = [];
    for (const file of walkSource(SRC_ROOT, (f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
      if (file.endsWith(join("lib", "csv", "serialize.ts"))) continue;
      const src = readFileSync(file, "utf8");
      if (/function\s+csvEscape\s*\(|const\s+csvEscape\s*=/.test(src)) {
        offenders.push(file.slice(SRC_ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});
