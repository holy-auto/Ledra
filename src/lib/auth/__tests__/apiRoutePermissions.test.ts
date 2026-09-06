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
 * 2026-09-03 時点で、まだこの書き方の残っているテストが28本ある。
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
import { walkSource, enclosingFunctions, handlerChunks } from "../../__tests__/sourceScan";

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
   * 無効化経路を拾う。合図は2つ。
   *
   *   1. 自前で `certificates` を UPDATE し、`certificate_voided` を出すか
   *      `status: "void"` を書いている（一本化前の形）
   *   2. 一本化した `@/lib/certificates/voidCertificate` を呼んでいる（2026-09-05〜）
   *
   * **2 を足さないと、一本化した瞬間にこの検査が空になって緑で通る**
   * （実際 2026-09-05 に5本→1本まで落ちた）。数を下げて通すのは
   * 「移設で弱める」（MISTAKE_LEDGER 型 D）なので、判定対象を移した。
   */
  function isVoidPath(src: string): boolean {
    if (/certificates\/voidCertificate/.test(src)) return true;
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

    // 書き込み（または一本化ヘルパーの呼び出し）を含む関数の中でガードされているかを見る。
    // ファイル全体では見ない（別の関数のガードで通ってしまう）。
    const calls = /certificates\/voidCertificate/.test(src) ? /voidCertificate\w*\(/g : /\.update\(/g;
    const writers = enclosingFunctions(src, calls).filter(
      (body) => /from\("certificates"\)/.test(body) || /voidCertificate\w*\(/.test(body),
    );
    if (!writers.length || !writers.every((body) => enforces(body, "certificates:void"))) ungated.push(rel);
  }

  it("検出できている（検出器が壊れて空で合格するのを防ぐ）", () => {
    // 2026-08-31 時点で5本。2026-09-05 に4本を `voidCertificate()` へ一本化したが、
    // **入口の数は変わっていない**（呼び出し側も検出対象に入れてある）。
    // 減ったら経路が消えたか検出器が壊れたかのどちらかで、どちらも確認が要る。
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
  /**
   * 認可として認識できる書き方。**この一覧は必ず不完全になる。**
   * 認可は任意のヘルパーで書けるので、正規表現で網羅はできない。
   *
   * 実際 2026-09-03 に、この一覧が短かったせいで「未強制24本」と報告してしまった。
   * 中身を読んだら 18本は別の形で守られていた（`canModifyLesson()` による著者判定、
   * `caller.role !== "super_admin"` のインライン判定、`createLesson.ts` の permission）。
   * だから下の KNOWN_UNGUARDED は「認可が無い」ではなく
   * **「この検出器が認可を認識できない」**の一覧であり、分類コメントが実態を持つ。
   */
  const GUARD = new RegExp(
    [
      // 弾く形（否定）でのみ認可と見なす。呼び出しの存在だけを見ると、結果を捨てる
      // 書き方（`const ok = requirePermission(...)`）でも一致して素通りする。
      // これは enforces() が `!` を要求しているのと同じ理由。
      String.raw`!\s*(?:requirePermission|hasPermission|requireMinRole|hasMinRole|hasMinOrgRole|isPlatformAdmin|isPlatformTenantId|canModifyLesson)\(`,
      // 早期 return する形の呼び出し
      String.raw`(?:resolveOrgAccess|assertPlatformTenantId|authorizeOrgStoreRead|resolveInsurerCaller|resolveManufacturerCaller|requireAal2OrResponse)\(`,
      // インラインのロール判定。**弾いている**ことまで求める。
      // `const isSoleOwner = caller.role === "owner" && ...` のような業務ロジックを
      // 認可と誤認しないため（2026-09-03 のレビューで mobile/account が
      // これで一覧から消えた）。
      String.raw`caller\.role\s*!==\s*"[a-z_]+"[\s\S]{0,80}?apiForbidden`,
    ].join("|"),
  );

  /**
   * 検出器が認可を認識できないハンドラ。**すべて中身を読んで分類してある。**
   * 増やさないこと。減らすときは、そのハンドラの認可を表に登録すること。
   */
  const KNOWN_UNGUARDED = new Set([
    // ── 自己完結（自分のデータだけを操作する。ロール権限を課す方が誤り）──
    "admin/feature-prefs [PUT]",
    "admin/mfa/enroll [POST]",
    "admin/mfa/factors/[id] [DELETE]",
    "admin/mfa/verify-enroll [POST]",
    "admin/tenants [PUT]", // アクティブテナントの切替
    "admin/ui-preferences [PUT]",
    "mobile/account [DELETE]", // 自分の退会。caller.role は「最後の owner か」の業務判定で、認可ではない
    "mobile/push/register [POST]",
    "mobile/push/register [DELETE]",
    "mobile/ui-preferences [PUT]",
    "webauthn/credentials/[id] [DELETE]",
    "webauthn/operation/options [POST]",
    "webauthn/operation/verify [POST]",
    "webauthn/register/options [POST]",
    "webauthn/register/verify [POST]",

    // ── 通知の既読。**自己完結ではない。**
    //    設計は「`user_id IS NULL` = 店舗宛 / `user_id = X` = X 個人宛」で、
    //    一覧・read-all・[id]/read の3経路とも
    //    `.or(user_id.is.null, user_id.eq.<自分>)` で絞る。
    //    代表判断 2026-09-04: **通知は店舗宛でよい。** 入庫・発注のような店の仕事なので
    //    「誰かが見たらもう出さなくていい」。本番62件はすべて user_id が null。
    //    ロール権限は課さない（既読は誰がやってもよい）ので、この検出器には出続ける。
    "admin/notifications/[id]/read [PUT]",
    "admin/notifications/read-all [PUT]",

    // ── 認証前の経路（まだ caller が確立していない）──
    "mobile/auth/otp/request [POST]",
    "mobile/auth/otp/verify [POST]",

    // ── 読み取りのみ（POST だが書き込まない）──
    "certificates/pdf-one [POST]", // PDF 出力。テナント所有チェックはある

    // ── 認可を共有関数に集約している（ルートの中には無い）──
    "admin/certificates [POST]", // createCertAction が certificates:create を要求する

    // ── 受講（自分の行にしか書けず、自分のレッスンは操作できない）──
    "admin/academy/lessons/[id]/complete [POST]",
    "admin/academy/lessons/[id]/complete [DELETE]",
    "admin/academy/lessons/[id]/quiz/attempt [POST]",
    "admin/academy/lessons/[id]/rate [POST]",
    "admin/academy/lessons/[id]/rate [DELETE]",

    // ── 著者判定で守られている（ルート内のローカルヘルパー。名前で照合すると
    //    無関係な同名関数を認可と誤認するので、検出器には入れない）──
    "admin/academy/lessons/[id]/quiz [PUT]", // ローカルの isAuthor()

    // ── createLesson.ts の permission チェックで守られている ──
    "admin/academy/lessons [POST]",
    "mobile/academy/lessons [POST]",
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
