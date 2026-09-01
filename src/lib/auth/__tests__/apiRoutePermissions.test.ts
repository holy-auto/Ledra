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

/**
 * `!requirePermission(caller, "x:y")` の形で**弾いている**か。
 *
 * 呼び出しの存在だけを見ると、結果を捨てる書き方（`const ok = requirePermission(...)`）
 * でも一致してしまい、素通りするルートが緑になる。否定まで要求する。
 * `if (cond && !requirePermission(...))` のような複合条件も正当なので、
 * `if (` の直後であることまでは求めない。
 */
function enforces(src: string, perm: Permission): boolean {
  return new RegExp(`!\\s*(requirePermission|hasPermission)\\([^)]*"${perm}"\\)`).test(src);
}

/** `!requireMinRole(caller, "staff")` の形で弾いているか。 */
function enforcesMinRole(src: string, role: string): boolean {
  return new RegExp(`!\\s*(requireMinRole|hasMinRole)\\([^)]*"${role}"\\)`).test(src);
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

/**
 * そのメソッドに課される要求。ルート全体の指定と、メソッド別の指定の両方を解く。
 *
 * メソッド別の指定を先に見る。`{ minRole: "staff", DELETE: "certificates:void" }` は
 * 型としては書けてしまうため、minRole を先に返すと DELETE の要求が黙って消える。
 */
function requiredFor(value: ApiRouteRequirement, method: MutatingMethod): MethodRequirement | null {
  if (typeof value === "string") return value;
  const perMethod = (value as Partial<Record<MutatingMethod, MethodRequirement>>)[method];
  if (perMethod !== undefined) return perMethod;
  return isMinRole(value) ? value : null;
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

describe("検出器そのものの性質", () => {
  it("結果を捨てる書き方は「強制している」と見なさない", () => {
    expect(enforces('const ok = requirePermission(caller, "certificates:edit");', "certificates:edit")).toBe(false);
    expect(
      enforces('if (!requirePermission(caller, "certificates:edit")) return apiForbidden();', "certificates:edit"),
    ).toBe(true);
    expect(enforcesMinRole('const ok = requireMinRole(caller, "staff");', "staff")).toBe(false);
    expect(enforcesMinRole('if (!requireMinRole(caller, "staff")) return apiForbidden();', "staff")).toBe(true);
  });

  it("メソッド別の指定が minRole より優先される（黙って弱くならない）", () => {
    const mixed = { minRole: "staff", DELETE: "certificates:void" } as unknown as ApiRouteRequirement;
    expect(requiredFor(mixed, "DELETE")).toBe("certificates:void");
    const post = requiredFor(mixed, "POST");
    expect(post !== null && isMinRole(post) && post.minRole).toBe("staff");
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

/**
 * 未登録の変更系ハンドラを見張る。
 *
 * `API_ROUTE_PERMISSIONS` の検査は**登録済み**のルートしか見ないので、表に載せ忘れた
 * ルートは検出されない。実際 `admin/invoices` は DELETE だけが admin 以上で
 * POST/PUT が素通りだったのに、調査を**ファイル単位**でやっていたため
 * 「強制済み」に数えられていた（2026-09-01 のレビューで発覚）。
 *
 * ここはハンドラ単位で走査し、既知の未強制ハンドラだけを許す。新しく増えたら落ちる。
 * リストを減らすときは、そのハンドラに認可を入れて表にも登録すること。
 * 残っている理由の分類は docs/context/OPEN_QUESTIONS.md にある。
 */
describe("未登録の変更系ハンドラ", () => {
  const GUARD =
    /requirePermission\(|hasPermission\(|requireMinRole\(|hasMinRole\(|resolveOrgAccess\(|hasMinOrgRole\(|isPlatformAdmin\(|isPlatformTenantId\(|assertPlatformTenantId\(|authorizeOrgStoreRead\(|resolveInsurerCaller\(|resolveManufacturerCaller\(|requireAal2OrResponse\(/;

  /** 認可を入れる判断がまだ済んでいない、既知のハンドラ。増やさないこと。 */
  const KNOWN_UNGUARDED = new Set([
    "admin/academy/cases [POST]",
    "admin/academy/feedback [POST]",
    "admin/academy/lessons/[id]/complete [POST]",
    "admin/academy/lessons/[id]/complete [DELETE]",
    "admin/academy/lessons/[id]/quiz/attempt [POST]",
    "admin/academy/lessons/[id]/quiz [PUT]",
    "admin/academy/lessons/[id]/rate [POST]",
    "admin/academy/lessons/[id]/rate [DELETE]",
    "admin/academy/lessons/[id] [PATCH]",
    "admin/academy/lessons/[id] [DELETE]",
    "admin/academy/lessons/[id]/video/upload-url [POST]",
    "admin/academy/lessons [POST]",
    "admin/academy/qa [POST]",
    "admin/academy/rewards/[id]/apply [POST]",
    "admin/academy/rewards [POST]",
    "admin/certificates [POST]",
    "admin/documents/share [POST]",
    "admin/feature-prefs [PUT]",
    "admin/members [PUT]",
    "admin/members [DELETE]",
    "admin/mfa/enroll [POST]",
    "admin/mfa/factors/[id] [DELETE]",
    "admin/mfa/verify-enroll [POST]",
    "admin/notifications/[id]/read [PUT]",
    "admin/notifications/read-all [PUT]",
    "admin/shop/checkout [POST]",
    "admin/tenants [PUT]",
    "admin/ui-preferences [PUT]",
    "certificates/pdf-one [POST]",
    "mobile/academy/lessons/[id] [PATCH]",
    "mobile/academy/lessons/[id] [DELETE]",
    "mobile/academy/lessons [POST]",
    "mobile/account [DELETE]",
    "mobile/auth/otp/request [POST]",
    "mobile/auth/otp/verify [POST]",
    "mobile/push/register [POST]",
    "mobile/push/register [DELETE]",
    "mobile/ui-preferences [PUT]",
    "stripe/connect/payment-link [POST]",
    "stripe/connect [POST]",
    "stripe/connect [DELETE]",
    "webauthn/credentials/[id] [DELETE]",
    "webauthn/operation/options [POST]",
    "webauthn/operation/verify [POST]",
    "webauthn/register/options [POST]",
    "webauthn/register/verify [POST]",
  ]);

  const found: string[] = [];
  for (const file of walkSource(API_ROOT, (f) => f.endsWith("route.ts"))) {
    const src = readFileSync(file, "utf8");
    const route = file
      .slice(API_ROOT.length + 1)
      .replace(/[\\/]route\.ts$/, "")
      .split(/[\\/]/)
      .join("/");
    for (const [method, chunk] of handlerChunks(src)) {
      if (method === "GET") continue;
      if (!/resolveCallerWithRole\(|resolveMobileCaller\(/.test(chunk)) continue;
      if (!GUARD.test(chunk)) found.push(`${route} [${method}]`);
    }
  }

  it("認可の無い変更系ハンドラが新しく増えていない", () => {
    expect(found.filter((h) => !KNOWN_UNGUARDED.has(h)).sort()).toEqual([]);
  });

  it("既知リストに、もう強制済みのものが残っていない（棚卸しの取りこぼしを防ぐ）", () => {
    expect([...KNOWN_UNGUARDED].filter((h) => !found.includes(h)).sort()).toEqual([]);
  });
});
