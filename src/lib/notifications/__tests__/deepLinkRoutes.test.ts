/**
 * deepLink.ts が生成するパスが、実在する Next.js ルートを指しているかを検証する（IMP-029）。
 *
 * このモジュールは docstring で「実際のルート構造 (src/app/) に合わせてある」と主張して
 * いるが、本番の呼び出し元がまだ無いため、その主張は一度も確かめられていなかった。
 * ルート側が動いた（ディレクトリ改名・削除）ときに静かに 404 リンクへ変わるので、
 * ファイルシステムと突き合わせる。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEEP_LINK_ENTITIES, buildDeepLink, buildCertificatePublicLink } from "../deepLink";

const APP = join(process.cwd(), "src", "app");

/**
 * `/admin/foo/BAR` のようなパスが実ルートに解決するか。
 * 動的セグメントは名前が違ってもよい（[id] / [public_id] / [reportId]）ため、
 * 親ディレクトリに動的ディレクトリが1つでもあれば解決とみなす。
 */
function routeExists(path: string): boolean {
  const segments = path.split("?")[0].split("/").filter(Boolean);
  let dir = APP;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const literal = join(dir, seg);
    if (existsSync(literal)) {
      dir = literal;
      continue;
    }
    // 動的セグメントに落とす
    const dyn = readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && /^\[.+\]$/.test(e.name));
    if (!dyn) return false;
    dir = join(dir, dyn.name);
  }
  return existsSync(join(dir, "page.tsx"));
}

describe("deepLink のパスは実在するルートを指す", () => {
  const BASE = "https://example.test";
  const ID = "00000000-0000-0000-0000-000000000001";

  it("自己チェック: 実在しないパスは false になる", () => {
    expect(routeExists("/admin/this-route-does-not-exist")).toBe(false);
  });

  for (const role of ["admin", "insurer"] as const) {
    it(`${role} ロールの生成パスがすべて実在する`, () => {
      const broken: string[] = [];
      for (const entity of DEEP_LINK_ENTITIES) {
        const { path } = buildDeepLink(BASE, { entity, id: ID, role });
        if (path === null) continue; // 意図的に未対応
        if (!routeExists(path)) broken.push(`${role}/${entity} -> ${path}`);
      }
      expect(broken).toEqual([]);
    });
  }

  it("customer ロールのポータルパスが実在する", () => {
    const { path } = buildDeepLink(BASE, { entity: "job", id: ID, role: "customer", tenantSlug: "acme" });
    expect(path).not.toBeNull();
    expect(routeExists(path as string)).toBe(true);
  });

  /**
   * routeExists は「動的セグメントが1つでもあれば解決」とみなすので、
   * **パスの形は合っているが必ず404になる**ケースは見抜けない。証明書がまさにそれで、
   * ルートは `[public_id]` かつ `public_id` 列で引いて見つからなければ notFound() する。
   * 行の id (uuid) を渡すと常に404になる。deepLink.ts の型に注記した契約を、
   * ルート側が変わったときに気づけるようここで固定する。
   */
  it("証明書のルートは public_id 引きのまま（deepLink の契約が前提にしている）", () => {
    const certDir = join(APP, "admin", "certificates");
    const dyn = readdirSync(certDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\[.+\]$/.test(e.name))
      .map((e) => e.name);
    expect(dyn).toEqual(["[public_id]"]);
    const page = readFileSync(join(certDir, "[public_id]", "page.tsx"), "utf8");
    expect(page).toMatch(/\.eq\("public_id"/);
  });

  it("証明書の公開検証ページが実在する", () => {
    const url = buildCertificatePublicLink(BASE, "CERT-123");
    expect(routeExists(url.slice(BASE.length))).toBe(true);
  });
});
