/**
 * サーバ側の権限強制を固定する（IMP-013）。
 *
 * `ROUTE_PERMISSIONS` / `AdminRouteGuard` はブラウザで動く表示制御であって、
 * セキュリティ境界ではない。実際の境界は各ハンドラの中に手書きされているため、
 * 経路が増えたときに黙って抜ける。
 *
 * 実際に抜けていた例（2026-08-31）: 証明書の無効化（不可逆・法的意味を持つ、
 * operationRisk = critical）に**5本**の経路があり、うち3本しか
 * `certificates:void`（admin+）を要求していなかった。
 *  - `/api/certificates/void`         … テナント所属だけで通っていた（viewer でも無効化可能）
 *  - `/api/admin/certificates/status` … 遷移表が `active→void` を `minRole: "staff"` としていた
 *  - `/admin/vehicles/[id]` の Server Action … RLS 任せ。`certificates` の UPDATE は
 *    PERMISSIVE ポリシー2本（`cert_update_member` = テナントメンバー全員 /
 *    `certificates_update_v2` = owner・admin・staff）の OR で評価されるため viewer でも通った
 *
 * この3本目・4本目・5本目は、最初に書いた検出器（`status: "void"` の文字列一致 +
 * `src/app/api` のみ走査）では見えなかった。**数え方が甘いと「塞いだ」と誤認する**ので、
 * 検出は「監査イベント `certificate_voided` を出す」という意味的な合図を主に使い、
 * 走査範囲は Server Action を含む `src/app` 全体にする。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { API_ROUTE_PERMISSIONS } from "../permissions";
import type { Permission } from "../permissions";

const APP_ROOT = join(process.cwd(), "src", "app");
const API_ROOT = join(APP_ROOT, "api");

function walk(dir: string, match: (name: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, match, out);
    } else if (match(name)) {
      out.push(p);
    }
  }
  return out;
}

/** `requirePermission(caller, "x:y")` / `hasPermission(role, "x:y")` の呼び出しがあるか。 */
function enforces(src: string, perms: readonly Permission[]): boolean {
  return perms.some((p) => new RegExp(`(requirePermission|hasPermission)\\([^)]*"${p}"\\)`).test(src));
}

/** 変更系ハンドラごとに切り出す（GET だけ守っている状態を通さないため）。 */
const HANDLER_SPLIT = /(?=export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b)/;
const MUTATING = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/;

function unenforcedMutatingHandlers(src: string, perms: readonly Permission[]): string[] {
  const bad: string[] = [];
  for (const part of src.split(HANDLER_SPLIT)) {
    const m = part.match(MUTATING);
    if (m && !enforces(part, perms)) bad.push(m[1]);
  }
  return bad;
}

/**
 * 証明書を無効化する経路を拾う。
 *
 * `certificates` への UPDATE を持つことを前提に、次のどちらかで無効化と判定する:
 *  - 監査イベント `certificate_voided` を記録している（書き方に依存しない意味的な合図。
 *    `admin/certificates/status` は `status: newStatus` と変数で書くため、
 *    リテラル一致だけでは見えない）
 *  - `status: "void"` を書き込んでいる（監査を残さない経路への保険）
 *
 * `certificateLog.ts`（型定義）・`catalogue.ts`（イベント名）・`admin/audit/page.tsx`
 * （表示ラベル）は `certificates` を UPDATE しないので自然に外れる。
 */
function isCertificateVoidPath(src: string): boolean {
  const writesCertificates = /from\("certificates"\)/.test(src) && /\.update\(/.test(src);
  if (!writesCertificates) return false;
  return /certificate_voided/.test(src) || /status:\s*"void"/.test(src);
}

function asList(v: Permission | readonly Permission[]): readonly Permission[] {
  return Array.isArray(v) ? v : [v as Permission];
}

describe("API ルートのサーバ側権限強制", () => {
  it("API_ROUTE_PERMISSIONS の全ルートが実在する", () => {
    const missing = Object.keys(API_ROUTE_PERMISSIONS).filter(
      (route) => !existsSync(join(API_ROOT, ...route.split("/"), "route.ts")),
    );
    expect(missing).toEqual([]);
  });

  it("登録ルートは変更系ハンドラ1つ1つが登録 Permission を要求する", () => {
    const unenforced: string[] = [];
    for (const [route, value] of Object.entries(API_ROUTE_PERMISSIONS)) {
      const file = join(API_ROOT, ...route.split("/"), "route.ts");
      if (!existsSync(file)) continue; // 上のテストが報告する
      const bad = unenforcedMutatingHandlers(readFileSync(file, "utf8"), asList(value));
      if (bad.length) unenforced.push(`${route} [${bad.join(",")}] -> ${asList(value).join("|")}`);
    }
    expect(unenforced).toEqual([]);
  });
});

describe("証明書の無効化 (operationRisk = critical)", () => {
  const voidPaths: string[] = [];
  const ungated: string[] = [];

  for (const file of walk(APP_ROOT, (n) => n.endsWith(".ts") || n.endsWith(".tsx"))) {
    const src = readFileSync(file, "utf8");
    if (!isCertificateVoidPath(src)) continue;
    const rel = file.slice(APP_ROOT.length + 1);
    voidPaths.push(rel);
    if (!enforces(src, ["certificates:void"])) ungated.push(rel);
  }

  it("検出できている（検出器が壊れて空で合格するのを防ぐ）", () => {
    // 2026-08-31 時点で5本。減ったら経路が消えたか検出器が壊れたかのどちらかで、
    // どちらも確認が要る。
    expect(voidPaths.length).toBeGreaterThanOrEqual(5);
  });

  it("API ルートも Server Action も、すべて certificates:void を要求する", () => {
    expect(ungated).toEqual([]);
  });
});
