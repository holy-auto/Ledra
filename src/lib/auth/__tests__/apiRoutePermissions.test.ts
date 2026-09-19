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
import {
  walkSource,
  enclosingFunctionsWithPos,
  handlerChunks,
  stripComments,
  wrapperCalls,
  wrapperGuards,
  withAliasTarget,
} from "../../__tests__/sourceScan";

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
 *
 * **ラッパに預けた形も認可として数える**（2026-09-18）。378 本を
 * `withCaller(handler, { permission: "x:y" })` へ寄せた結果、ハンドラ本文から
 * この呼び出しが消え、**登録ルート 144 件がまとめて「未強制」に化けた**。
 * 認可の在処が変わったのに検出器が追いついていなかっただけで、実物は守られている。
 * ラッパを信用してよい根拠は `src/lib/api/__tests__/withCaller.test.ts`
 * （値の水準で 401 / 403 / レート制限を固定している）。
 */
function enforces(src: string, perm: Permission): boolean {
  if (new RegExp(`!\\s*(requirePermission|hasPermission)\\([^)]*"${perm}"\\)`).test(src)) return true;
  return wrapperGuards(src).permissions.has(perm);
}

/** `!requireMinRole(caller, "staff")` の形で弾いているか（ラッパのオプションも同じ扱い）。 */
function enforcesMinRole(src: string, role: string): boolean {
  if (new RegExp(`!\\s*(requireMinRole|hasMinRole)\\([^)]*"${role}"\\)`).test(src)) return true;
  return wrapperGuards(src).minRoles.has(role);
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
      const chunks = handlerChunks(stripComments(readFileSync(file, "utf8"), file));
      if (!MUTATING_METHODS.some((m) => chunks.has(m))) unrecognized.push(route);
    }
    expect(unrecognized).toEqual([]);
  });

  it("登録ルートは変更系ハンドラ1つ1つが必要な Permission を要求する", () => {
    const unenforced: string[] = [];
    for (const [route, value] of Object.entries(API_ROUTE_PERMISSIONS)) {
      const file = join(API_ROOT, ...route.split("/"), "route.ts");
      if (!existsSync(file)) continue;
      // **コメントを落としてから照合する。** 説明コメントに書いた
      // `!requirePermission(...)` を本物と読む形を、この repo は2回やっている（M-022）。
      const chunks = handlerChunks(stripComments(readFileSync(file, "utf8"), file));
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

  it("ラッパのオプションに書いた認可を認める（withCaller 統一後の形）", () => {
    const src =
      'export const POST = withCaller(async (req, { caller }) => apiOk({}), { permission: "certificates:edit" });';
    expect(enforces(src, "certificates:edit")).toBe(true);
    expect(enforcesMinRole('export const PUT = withCaller(h, { minRole: "owner" });', "owner")).toBe(true);
  });

  it("ラッパのオプションでも、要求と違う値なら認めない（陰性対照）", () => {
    // 「どれか1つ認可があればよい」にすると、表が要求した権限と違うものでも
    // 緑になる。実際 certificates:void は certificates:edit より強い。
    const src = 'export const POST = withCaller(h, { permission: "certificates:edit" });';
    expect(enforces(src, "certificates:void")).toBe(false);
    expect(enforcesMinRole('export const PUT = withCaller(h, { minRole: "staff" });', "owner")).toBe(false);
  });

  it("ラッパでない関数の同じ形のオプションは認可と読まない（陰性対照）", () => {
    // `{ permission: "..." }` はただのオブジェクト。どの関数に渡したかで意味が変わる。
    expect(
      enforces('export const POST = logSomething(h, { permission: "certificates:void" });', "certificates:void"),
    ).toBe(false);
  });

  it("読めない渡し方は認可と見なさない（変数・短縮形は fail closed）", () => {
    expect(enforces("export const POST = withCaller(h, OPTIONS);", "certificates:void")).toBe(false);
    expect(enforces("export const POST = withCaller(h, { permission });", "certificates:void")).toBe(false);
  });

  it("別名 export の実体まで辿る（`const h = withCaller(...); export const POST = h;`）", () => {
    // レビューが実際にこの形で無認可のルートを検査に通した（2026-09-18）。
    const src = [
      'const h = withCaller(async (req) => apiOk({}), { permission: "certificates:void" });',
      "export const POST = h;",
    ].join("\n");
    expect(enforces("export const POST = h;", "certificates:void")).toBe(false); // 断片だけでは見えない
    expect(enforces(withAliasTarget(src, "export const POST = h;"), "certificates:void")).toBe(true);
  });

  it("別名の実体に認可が無ければ、辿っても認めない（陰性対照）", () => {
    const src = ["const h = withCaller(async (req) => apiOk({}));", "export const POST = h;"].join("\n");
    expect(enforces(withAliasTarget(src, "export const POST = h;"), "certificates:void")).toBe(false);
  });

  it("別名の実体が見つからないときは断片を補わない", () => {
    // 実体が別ファイルにある形。**無いものを認可として補うと嘘をつく側に倒れる。**
    expect(withAliasTarget("export const POST = imported;", "export const POST = imported;")).toBe(
      "export const POST = imported;",
    );
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
    // stripComments は文字数を保つ（コメントを空白にする）ので、下の位置判定は狂わない。
    const src = stripComments(readFileSync(file, "utf8"), file);
    if (!isVoidPath(src)) continue;
    const rel = file.slice(APP_ROOT.length + 1);
    voidPaths.push(rel);

    // 書き込み（または一本化ヘルパーの呼び出し）を含む関数の中でガードされているかを見る。
    // ファイル全体では見ない（別の関数のガードで通ってしまう）。
    const calls = /certificates\/voidCertificate/.test(src) ? /voidCertificate\w*\(/g : /\.update\(/g;
    const writers = enclosingFunctionsWithPos(src, calls).filter(
      ({ body }) => /from\("certificates"\)/.test(body) || /voidCertificate\w*\(/.test(body),
    );
    // **ラッパに預けた認可は書き込み関数の外側に出る。**
    // `withCaller(async (req) => { …void… }, { permission: "certificates:void" })` は
    // 本文だけ見ると無防備に見える。その書き込みを**包んでいる**ラッパだけを数える
    // （ファイル内の別のラッパのオプションを流用しない）。
    const gates = wrapperCalls(src, file).filter((c) => c.permissions.has("certificates:void"));
    const gated = ({ pos, body }: { pos: number; body: string }) =>
      enforces(body, "certificates:void") || gates.some((g) => g.start <= pos && pos < g.end);
    if (!writers.length || !writers.every(gated)) ungated.push(rel);
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
    // パッケージ展開。GET と同じ結果を返す副作用なしの読み取りで、POST は RPC 的な
    // 使い方のために許しているだけ。読むのは自テナントの行だけ
    //（createTenantScopedAdmin + 全クエリに tenant_id 一致）。
    // **別名 export の解決を入れて初めて見えた**（/code-review 指摘 2026-09-18）。
    "admin/service-packages/[id]/expand [POST]",

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

    // ── 実証テスト：施工店が自テナントのデータのみ操作する自己完結経路 ──
    //    書き込みはいずれも caller.tenantId で絞っている（自社の応募・契約・案件・証拠・
    //    教育・プロフィールのみ）。ロール権限を課すと施工店が自分のデータを出せなくなる。
    //    **Web(admin) とモバイルに同じハンドラが2面ある**ので両方を挙げる。片面だけだと
    //    検出器が兄弟を「新しく増えた無認可ルート」として拾う（2026-09-19 に実際に拾った）。
    //    テナント内では viewer も実行できる点は #1093 の設計判断のまま（OPEN_QUESTIONS）。
    "admin/field-test/applications [POST]",
    "admin/field-test/applications/[id] [PATCH]",
    "admin/field-test/agreements/[id] [PATCH]",
    "admin/field-test/workshop-profile [PUT]",
    "admin/field-test/jobs/[id] [PATCH]",
    "admin/field-test/condition-checks [POST]",
    "admin/field-test/evidence [POST]",
    "admin/field-test/training/completions [POST]",
    "mobile/field-test/applications [POST]",
    "mobile/field-test/applications/[id] [PATCH]",
    "mobile/field-test/agreements/[id] [PATCH]",
    "mobile/field-test/workshop-profile [PUT]",
    "mobile/field-test/jobs/[id] [PATCH]",
    "mobile/field-test/condition-checks [POST]",
    "mobile/field-test/evidence [POST]",
    "mobile/field-test/training/completions [POST]",

    // ── 買い手側の操作（ロール権限を課す方が誤り）──
    //    BtoB マーケットの問い合わせ送信。**検出器を withCaller 対応にして初めて見えた**
    //    （2026-09-18）。出品側の `market:*` を課すと、買いたい側が送れなくなる。
    //    売り手テナントは車両から引く（caller からではない）ので、どのテナントの
    //    メンバーでも送れてよい。IP 単位の 5件/15分 制限あり。
    //    掲載中(listed)の車両にしか送れないことも確認済み。
    "market/inquiries [POST]",
  ]);

  const found: string[] = [];
  for (const file of walkSource(API_ROOT, (f) => f.endsWith("route.ts"))) {
    const src = stripComments(readFileSync(file, "utf8"), file);
    const route = file
      .slice(API_ROOT.length + 1)
      .replace(/[\\/]route\.ts$/, "")
      .split(/[\\/]/)
      .join("/");
    for (const [method, rawChunk] of handlerChunks(src)) {
      if (method === "GET") continue;
      // `export const POST = handler;` の実体はこの断片の外にある。足さないと
      // 「認可なし」にも「caller 未解決」にも見える（/code-review 指摘 2026-09-18）。
      const chunk = withAliasTarget(src, rawChunk, file);
      // **ラッパ包みも「caller を解決している」に数える。** ここを直すまで、
      // `withCaller` へ寄せた 378 本はこの continue で丸ごと視界から消えており、
      // 認可の無いハンドラを増やしても赤にならない状態だった（2026-09-18）。
      const guards = wrapperGuards(chunk, file);
      if (!/resolveCallerWithRole\(|resolveMobileCaller\(/.test(chunk) && !guards.wrapped) continue;
      const wrapperEnforces = guards.permissions.size > 0 || guards.minRoles.size > 0;
      if (!GUARD.test(chunk) && !wrapperEnforces) found.push(`${route} [${method}]`);
    }
  }

  it("認可の無い変更系ハンドラが新しく増えていない", () => {
    expect(found.filter((h) => !KNOWN_UNGUARDED.has(h)).sort()).toEqual([]);
  });

  it("既知リストに、もう強制済みのものが残っていない（棚卸しの取りこぼしを防ぐ）", () => {
    expect([...KNOWN_UNGUARDED].filter((h) => !found.includes(h)).sort()).toEqual([]);
  });
});

/**
 * `/api/admin/agent*`（代理店運営 API）は `agents` がテナントを持たない
 * プラットフォーム共通資源であり、`isPlatformAdmin` 必須（A-H1、2026-09-08）。
 *
 * 監査で判明した実例: 一覧・作成系 14 本が `requireMinRole(caller, "admin")`
 * （自テナント admin なら誰でも通る）のみで守られ、`createTenantScopedAdmin`
 * （RLS バイパスの service-role クライアント）を任意テナント admin から
 * 実行できていた。同機能の `[id]` ルートは既に `isPlatformAdmin` 必須。
 *
 * `enforces()`/GUARD 系の一般検出は「何らかの認可があるか」しか見ず
 * `requireMinRole` も認可として認識するため、この退行は拾えない。
 * ここでは `/api/admin/agent*` に限定して `isPlatformAdmin` の使用を直接要求する。
 */
describe("代理店運営 API (/api/admin/agent*) は isPlatformAdmin 必須", () => {
  const files = walkSource(API_ROOT, (f) => f.endsWith("route.ts")).filter((f) => {
    const rel = f
      .slice(API_ROOT.length + 1)
      .split(/[\\/]/)
      .join("/");
    return rel.startsWith("admin/agent-") || rel.startsWith("admin/agents/");
  });

  it("対象ファイルを取りこぼしていない（検出器が壊れて空で合格するのを防ぐ）", () => {
    expect(files.length).toBeGreaterThanOrEqual(14);
  });

  it("全ファイルが isPlatformAdmin をガードとして使い、requireMinRole/createTenantScopedAdmin に依存しない", () => {
    const bad: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, "utf8"), file);
      const rel = file
        .slice(API_ROOT.length + 1)
        .split(/[\\/]/)
        .join("/");
      const chunks = handlerChunks(src);
      for (const [method, chunk] of chunks) {
        if (!/resolveCallerWithRole\(/.test(chunk)) continue;
        if (!/!\s*isPlatformAdmin\(caller\)/.test(chunk)) {
          bad.push(`${rel} [${method}] -> isPlatformAdmin ガード無し`);
        }
      }
      if (/requireMinRole\(caller,\s*"admin"\)/.test(src)) {
        bad.push(`${rel} -> requireMinRole(caller, "admin") が残存`);
      }
      if (/createTenantScopedAdmin\(/.test(src)) {
        bad.push(`${rel} -> createTenantScopedAdmin を使用（RLS バイパスがテナントスコープに閉じない）`);
      }
    }
    expect(bad.sort()).toEqual([]);
  });
});
