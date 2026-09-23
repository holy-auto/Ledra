import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 管理画面のサーバー側（page / route）は、テナントを resolveCallerWithRole で解決する。
 * tenant_memberships を直接 `.limit(1)` で引くと、複数テナント所属のユーザーが
 * 選択中テナント（active_tenant_id）ではなく任意の所属テナントのデータを見てしまう
 * （承認インボックスからの直リンクが 404 になった実例あり、PR #1140）。
 *
 * ponytail: 文字列の走査による検査。tenant_memberships を正しく読む必要がある画面が
 * 将来出てきたら、ALLOWED に理由付きで足す。
 */
const ROOT = join(process.cwd(), "src/app/admin");
const ALLOWED = new Set<string>([]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("管理画面のテナント解決", () => {
  it("src/app/admin は tenant_memberships を直接引かない（resolveCallerWithRole を使う）", () => {
    const files = walk(ROOT);
    expect(files.length).toBeGreaterThan(100); // 走査対象が空で緑にならないように
    const offenders = files
      .filter((f) => !ALLOWED.has(f))
      .filter((f) => readFileSync(f, "utf8").includes('from("tenant_memberships")'))
      .map((f) => f.slice(process.cwd().length + 1));
    expect(offenders).toEqual([]);
  });

  it("adminFeatureGate は解決済みの caller のテナントを使う", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/billing/adminFeatureGate.ts"), "utf8");
    expect(src).not.toContain('from("tenant_memberships")');
  });
});
