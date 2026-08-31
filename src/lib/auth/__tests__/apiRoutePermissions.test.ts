/**
 * API ルートのサーバ側権限強制を固定する（IMP-013）。
 *
 * ROUTE_PERMISSIONS / AdminRouteGuard はブラウザで動く表示制御であって、
 * セキュリティ境界ではない。実際の境界は各 route.ts の中にあり、そこは
 * ルートごとに手書きされているため、経路が増えたときに黙って抜ける。
 *
 * 実際に抜けていた例（2026-08-31 に発見）: 証明書の無効化（不可逆・法的意味を持つ、
 * operationRisk = critical）は3経路あり、mobile は certificates:void を、
 * admin は requireMinRole("admin") を検査していたが、/api/certificates/void は
 * **テナントに所属しているだけで通っていた**。viewer でも証明書を無効化できた。
 *
 * このテストは2方向から縛る:
 *  1. API_ROUTE_PERMISSIONS に登録したルートは、実際にその Permission を検査している
 *  2. 証明書を無効化する経路は、漏れなく API_ROUTE_PERMISSIONS に登録されている
 *
 * 新しい無効化経路を足したときは 2 が落ちる。登録して権限検査を入れるのが正しい対応で、
 * 除外リストに足すのは原則として誤り。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { API_ROUTE_PERMISSIONS } from "../permissions";

const API_ROOT = join(process.cwd(), "src", "app", "api");

function walkRoutes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walkRoutes(p, out);
    } else if (name === "route.ts") {
      out.push(p);
    }
  }
  return out;
}

/** src/app/api からの相対ディレクトリ（POSIX 区切り）。 */
function routeKey(file: string): string {
  return file
    .slice(API_ROOT.length + 1)
    .replace(/[\\/]route\.ts$/, "")
    .split(/[\\/]/)
    .join("/");
}

/**
 * 証明書を無効化する経路を拾う。
 * パス名（.../void/route.ts）と実際の書き込み（certificates に status: "void"）の
 * **和**で数える。片方だけだと、パスに void を含まない経路や、
 * void を出すだけで書き込まないヘルパーを取り違える。
 */
function isCertificateVoidRoute(key: string, src: string): boolean {
  if (!/from\("certificates"\)/.test(src)) return false;
  if (/\.(update|upsert)\(/.test(src) && /status:\s*"void"/.test(src)) return true;
  return /(^|\/)void$/.test(key) || /\/void\//.test(key);
}

describe("API ルートのサーバ側権限強制", () => {
  const files = walkRoutes(API_ROOT);

  it("API_ROUTE_PERMISSIONS の全ルートが実在する", () => {
    const missing = Object.keys(API_ROUTE_PERMISSIONS).filter(
      (route) => !existsSync(join(API_ROOT, ...route.split("/"), "route.ts")),
    );
    expect(missing).toEqual([]);
  });

  it("API_ROUTE_PERMISSIONS の全ルートが実際にその Permission を検査している", () => {
    const unenforced: string[] = [];
    for (const [route, perm] of Object.entries(API_ROUTE_PERMISSIONS)) {
      const file = join(API_ROOT, ...route.split("/"), "route.ts");
      if (!existsSync(file)) continue; // 上のテストが報告する
      if (!readFileSync(file, "utf8").includes(`"${perm}"`)) unenforced.push(`${route} -> ${perm}`);
    }
    expect(unenforced).toEqual([]);
  });

  it("証明書を無効化する経路はすべて certificates:void を要求する", () => {
    const voidRoutes: string[] = [];
    const ungated: string[] = [];

    for (const file of files) {
      const key = routeKey(file);
      const src = readFileSync(file, "utf8");
      if (!isCertificateVoidRoute(key, src)) continue;
      voidRoutes.push(key);
      if (API_ROUTE_PERMISSIONS[key] !== "certificates:void") ungated.push(key);
    }

    // 経路を1本も拾えていないなら検出ロジックが壊れている（空の合格を防ぐ）
    expect(voidRoutes.length).toBeGreaterThanOrEqual(3);
    expect(ungated).toEqual([]);
  });
});
