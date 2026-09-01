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
 *
 * この検出器自体も2度直している。教訓を2つ埋め込んである。
 *  1. 操作は**書き方**（`status: "void"`）ではなく**事実**（監査イベント
 *     `certificate_voided` を出している）で探す。変数で書く経路を見落とすため。
 *  2. ガードの有無は**ファイル全体**ではなく**書き込みを含む関数**の中で見る。
 *     同じファイル内の別目的の呼び出し（ボタン出し分け用の権限評価など）が
 *     ファイル全体の一致を成立させてしまい、肝心のガードを消しても緑になるため。
 *
 * ガードを足すときの注意: ルートのテストが `vi.mock("@/lib/auth/checkRole", () => ...)`
 * とモジュールごと差し替えていると `requirePermission` が undefined になり、
 * 403 のはずが TypeError で 500 になる。`importOriginal` で実物を残すこと。
 * 2026-09-01 時点で、まだこの書き方の残っているテストが29本ある。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { API_ROUTE_PERMISSIONS } from "../permissions";
import type {
  Permission,
  MutatingMethod,
  ApiRouteRequirement,
  MethodRequirement,
  MinRoleRequirement,
} from "../permissions";
import { walkSource, enclosingFunctions } from "../../__tests__/sourceScan";

const APP_ROOT = join(process.cwd(), "src", "app");
const API_ROOT = join(APP_ROOT, "api");

const MUTATING_METHODS: MutatingMethod[] = ["POST", "PUT", "PATCH", "DELETE"];

/** `requirePermission(caller, "x:y")` / `hasPermission(role, "x:y")` の呼び出しがあるか。 */
function enforces(src: string, perm: Permission): boolean {
  return new RegExp(`(requirePermission|hasPermission)\\([^)]*"${perm}"\\)`).test(src);
}

/** `requireMinRole(caller, "staff")` / `hasMinRole(role, "staff")` の呼び出しがあるか。 */
function enforcesMinRole(src: string, role: string): boolean {
  return new RegExp(`(requireMinRole|hasMinRole)\\([^)]*"${role}"\\)`).test(src);
}

/** route.ts をハンドラ単位に切る。`export const POST = ...` 形式も認識する。 */
function handlerChunks(src: string): Map<string, string> {
  const split =
    /(?=export\s+(?:async\s+)?(?:function\s+(?:GET|POST|PUT|PATCH|DELETE)\b|const\s+(?:GET|POST|PUT|PATCH|DELETE)\s*=))/;
  const named = /export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/;
  const out = new Map<string, string>();
  for (const part of src.split(split)) {
    const m = part.match(named);
    if (m) out.set(m[1], part);
  }
  return out;
}

function isMinRole(v: ApiRouteRequirement | MethodRequirement): v is MinRoleRequirement {
  return typeof v === "object" && v !== null && "minRole" in v;
}

/** そのメソッドに課される要求。ルート全体の指定と、メソッド別の指定の両方を解く。 */
function requiredFor(value: ApiRouteRequirement, method: MutatingMethod): MethodRequirement | null {
  if (typeof value === "string" || isMinRole(value)) return value;
  return value[method] ?? null;
}

describe("API ルートのサーバ側権限強制", () => {
  it("API_ROUTE_PERMISSIONS の全ルートが実在する", () => {
    const missing = Object.keys(API_ROUTE_PERMISSIONS).filter(
      (route) => !existsSync(join(API_ROOT, ...route.split("/"), "route.ts")),
    );
    expect(missing).toEqual([]);
  });

  it("登録ルートの変更系ハンドラを認識できている（空振り合格を防ぐ）", () => {
    const unrecognized: string[] = [];
    for (const route of Object.keys(API_ROUTE_PERMISSIONS)) {
      const file = join(API_ROOT, ...route.split("/"), "route.ts");
      if (!existsSync(file)) continue;
      const chunks = handlerChunks(readFileSync(file, "utf8"));
      if (!MUTATING_METHODS.some((m) => chunks.has(m))) unrecognized.push(route);
    }
    expect(unrecognized).toEqual([]);
  });

  it("登録ルートは変更系ハンドラ1つ1つが必要な Permission を要求する", () => {
    const unenforced: string[] = [];
    for (const [route, value] of Object.entries(API_ROUTE_PERMISSIONS)) {
      const file = join(API_ROOT, ...route.split("/"), "route.ts");
      if (!existsSync(file)) continue;
      const chunks = handlerChunks(readFileSync(file, "utf8"));
      for (const method of MUTATING_METHODS) {
        const chunk = chunks.get(method);
        if (!chunk) continue;
        const req = requiredFor(value, method);
        if (req === null) {
          unenforced.push(`${route} [${method}] -> 要求が表に無い`);
        } else if (isMinRole(req)) {
          if (!enforcesMinRole(chunk, req.minRole)) {
            unenforced.push(`${route} [${method}] -> minRole ${req.minRole}`);
          }
        } else if (!enforces(chunk, req)) {
          unenforced.push(`${route} [${method}] -> ${req}`);
        }
      }
    }
    expect(unenforced).toEqual([]);
  });
});

describe("証明書の無効化 (operationRisk = critical)", () => {
  /**
   * 無効化経路を拾う。`certificates` への UPDATE があることを前提に、
   * 監査イベント `certificate_voided` を出しているか（書き方に依存しない合図）、
   * または `status: "void"` を書いているかで判定する。
   */
  function isVoidPath(src: string): boolean {
    if (!/from\("certificates"\)/.test(src) || !/\.update\(/.test(src)) return false;
    return /certificate_voided/.test(src) || /status:\s*"void"/.test(src);
  }

  const voidPaths: string[] = [];
  const ungated: string[] = [];

  for (const file of walkSource(APP_ROOT)) {
    const src = readFileSync(file, "utf8");
    if (!isVoidPath(src)) continue;
    const rel = file.slice(APP_ROOT.length + 1);
    voidPaths.push(rel);

    // 書き込みを含む関数の中でガードされているかを見る（ファイル全体では見ない）。
    const writers = enclosingFunctions(src, /\.update\(/g).filter((body) => /from\("certificates"\)/.test(body));
    if (!writers.length || !writers.every((body) => enforces(body, "certificates:void"))) ungated.push(rel);
  }

  it("検出できている（検出器が壊れて空で合格するのを防ぐ）", () => {
    // 2026-08-31 時点で5本。減ったら経路が消えたか検出器が壊れたかのどちらかで、
    // どちらも確認が要る。
    expect(voidPaths.length).toBeGreaterThanOrEqual(5);
  });

  it("API ルートも Server Action も、書き込む関数の中で certificates:void を要求する", () => {
    expect(ungated).toEqual([]);
  });
});
