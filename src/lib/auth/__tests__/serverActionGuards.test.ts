/**
 * Server Action の認可を固定する。
 *
 * Server Action は `API_ROUTE_PERMISSIONS` の表に載らない（route.ts ではない）ので、
 * `apiRoutePermissions.test.ts` の検出器はここを一切見ていない。**表に無い書き込み経路**である。
 *
 * ## 実際に起きたこと
 *
 * 1. `updateTenantSettingsAction`（設定画面の保存）は**ロール判定を1つも持たず**、
 *    RLS 任せだった（2026-09-04 に修正）。
 * 2. `site-content` の4アクションはアプリ側が `staff` 以上を要求していたが、
 *    DB の RLS は `is_super_admin_user()` しか通さない（2026-09-04 に修正）。
 *
 * どちらも同じ形で壊れる。**RLS が弾いても supabase-js の `.update()` / `.delete()` は
 * 「0行・エラー無し」を返す**ので、アプリは成功を返す。ユーザーには「保存しました」と
 * 出るのに何も変わっていない。INSERT だけは WITH CHECK が例外を投げるので気づける。
 *
 * ## この検査の限界
 *
 * Server Action は `"use server"` をファイル先頭にも関数内にも書けるため、
 * 静的に完全な一覧を作るのは難しい。ここでは**ファイル先頭に `"use server"` を持つ
 * ファイル**だけを見て、各 export が認可ヘルパーを呼んでいることを検査する。
 * 関数内宣言（`vehicles/[id]/page.tsx` の `voidCertificate` など）は対象外なので、
 * 新しく Server Action を書く人は自分で確認すること。
 * **「この検査が緑＝全部守られている」ではない**（MISTAKE_LEDGER 型 A）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { walkSource } from "@/lib/__tests__/sourceScan";
import {
  parse,
  namedFunctions,
  calleeName,
  unwrapAwait,
  negated,
  alwaysExits,
  collect,
  calls,
  statementLists,
  declarationOf,
  firstSideEffectPos,
} from "@/lib/__tests__/astScan";
import { hasPermission } from "@/lib/auth/permissions";

const APP_ROOT = join(process.cwd(), "src", "app");

/** 真偽値で「権限がある／ない」を返すヘルパー。**否定して弾く**のが正しい使い方。 */
const BOOLEAN_HELPERS = ["requirePermission", "requireMinRole", "hasPermission", "hasMinRole", "isPlatformAdmin"];
/** 返り値ではなく **throw** で止めるヘルパー。呼んだ時点で守られている。 */
const THROWING_HELPERS = ["resolveAuthorizedTenantId"];

/** `!helper(...)` の形か（`if` の条件として渡ってくる）。 */
function isNegatedHelperCall(cond: ts.Expression, helpers: readonly string[]): boolean {
  const inner = negated(cond);
  if (!inner) return false;
  const name = calleeName(unwrapAwait(inner));
  return name !== null && helpers.includes(name);
}

/**
 * その本文が**自分で**認可して弾いているか。
 *
 * 3段階で甘かった。呼び出しの存在だけ → `const ok = requirePermission(...)` が素通り。
 * 否定まで要求 → `const denied = !requirePermission(...)` が素通り。
 * **否定が return / throw に繋がっている**ことまで要求しても、正規表現だと
 * `if (!requirePermission(...)) audit(); return write();` のように
 * **`if` の外の return** を拾って素通りした（いずれも Codex の指摘）。
 * 構文木なら「その `if` の then 分岐が必ず抜けるか」を直接見られる。
 */
function guardsDirectly(body: ts.Node | undefined): boolean {
  if (!body) return false;
  // **書き込みより前**であることまで見る。本文のどこかにガードがあれば良いのなら、
  // `await write(); if (!requirePermission(...)) return forbidden;` も合格してしまう
  // （書き込んだ後に弾いても認可の意味を成さない。Codex の指摘）。
  const writeAt = firstSideEffectPos(body);
  const throwing = collect(body, ts.isCallExpression).find((c) => THROWING_HELPERS.includes(calleeName(c) ?? ""));
  if (throwing && throwing.getStart() < writeAt) return true;
  return collect(body, ts.isIfStatement).some(
    (n) => isNegatedHelperCall(n.expression, BOOLEAN_HELPERS) && alwaysExits(n.thenStatement) && n.getEnd() <= writeAt,
  );
}

/**
 * ファイル内のヘルパーに委ねて弾いているか。
 *
 * `site-content/actions.ts` は `authorize()` に委ねる形。ただし **`authorize()` は
 * throw せず `Err` を返す**ので、**呼ぶだけでは守られていない**。
 * `await authorize(); return write();` は認可失敗でもそのまま書き込む（Codex の指摘）。
 * 「結果を受けて、その結果で必ず抜ける `if` がある」ことまで要求する。
 */
function delegatesGuard(body: ts.Node | undefined, helpers: readonly string[]): boolean {
  if (!body || helpers.length === 0) return false;
  return statementLists(body).some((stmts) =>
    stmts.some((stmt, i) => {
      const decl = declarationOf(stmt);
      if (!decl) return false;
      const name = calleeName(unwrapAwait(decl.init));
      if (name === null || !helpers.includes(name)) return false;
      // 同じスコープの**後ろの文**だけを見る。別ブロックのガードを流用させない。
      const rest = stmts.slice(i + 1);
      const writeAt = firstSideEffectPos(body);
      return rest.some(
        (st) =>
          ts.isIfStatement(st) &&
          collect(st.expression, ts.isIdentifier).some((id) => id.text === decl.name) &&
          alwaysExits(st.thenStatement) &&
          st.getEnd() <= writeAt, // 書き込みより前で弾いていること
      );
    }),
  );
}

/**
 * **export された Server Action を1本ずつ**見て、守られていないものを返す。
 *
 * ファイル全体で1回でもガードが見つかれば合格にしていたので、4本ある export の
 * 1本からガードを外しても、他の3本のガードで緑のままだった（Codex の指摘）。
 * `export const f = async () => {}` も同じ一覧に載せる（`namedFunctions`）。
 */
function unguardedExports(src: string): string[] {
  const fns = namedFunctions(parse(src));
  const helpers = fns.filter((f) => !f.exported && guardsDirectly(f.body)).map((f) => f.name);
  return fns
    .filter((f) => f.exported)
    .filter((f) => !guardsDirectly(f.body) && !delegatesGuard(f.body, helpers))
    .map((f) => f.name);
}

/**
 * 認可を課さないことに理由がある export。
 * 増やすときは、なぜ認可が要らないのかを書くこと。
 */
const EXEMPT = new Set<string>([
  // ログイン前の経路。caller がまだ存在しない。
  "app/login/page.tsx",
]);

function serverActionFiles(): { rel: string; src: string }[] {
  return walkSource(APP_ROOT, (f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((file) => ({ rel: file.slice(join(process.cwd(), "src").length + 1), src: readFileSync(file, "utf8") }))
    .filter(({ src }) => /^["']use server["'];/m.test(src.split("\n").slice(0, 3).join("\n")));
}

describe("Server Action の認可", () => {
  const files = serverActionFiles();

  it("検出器が空振りしていない", () => {
    // 0件になると下の検査が素通りで緑になる。既知のファイルを名指しする。
    expect(files.length).toBeGreaterThanOrEqual(3);
    const names = files.map((f) => f.rel);
    expect(names).toContain("app/admin/settings/actions.ts");
    expect(names).toContain("app/admin/site-content/actions.ts");
    expect(names).toContain("app/admin/certificates/new/actions.ts");
  });

  it('ファイル先頭が "use server" のファイルは認可で弾いている', () => {
    const unguarded = files
      .filter((f) => !EXEMPT.has(f.rel))
      .flatMap((f) => unguardedExports(f.src).map((name) => `${f.rel} :: ${name}`))
      .sort();
    expect(unguarded).toEqual([]);
  });
});

describe("サイトコンテンツはプラットフォーム運営のみ", () => {
  /**
   * DB 側は `is_super_admin_user()` しか通さない
   * （20260424010000_site_content_posts_super_admin_only.sql:
   *  「加盟店（owner/admin/staff/viewer）はDB直接操作でも変更不可」）。
   * 権限表がこれより緩いと、アプリのガードを通過してから RLS に弾かれ、
   * UPDATE と DELETE が 0 行・エラー無しで「成功」になる。
   */
  it("site_content:manage を持つのは super_admin だけ", () => {
    expect(hasPermission("super_admin", "site_content:manage")).toBe(true);
    for (const role of ["owner", "admin", "staff", "viewer"] as const) {
      expect(hasPermission(role, "site_content:manage"), `${role} が持っている`).toBe(false);
    }
  });

  it("site_content:view を持つのも super_admin だけ（加盟店にメニューを出さない）", () => {
    expect(hasPermission("super_admin", "site_content:view")).toBe(true);
    for (const role of ["owner", "admin", "staff", "viewer"] as const) {
      expect(hasPermission(role, "site_content:view"), `${role} が持っている`).toBe(false);
    }
  });

  /**
   * ナビから消しても画面は残る。3画面は「ログイン済みか」しか見ておらず、
   * URL 直打ちで来た加盟店ユーザーには**押せば必ず forbidden になる
   * ボタンとフォームだけ**が並んでいた（MISTAKE_LEDGER M-019 と同じ形）。
   * サーバ側で権限を見ていることを固定する。
   */
  it("サイトコンテンツの3画面がサーバ側で権限を見ている", () => {
    const pages = [
      "app/admin/site-content/page.tsx",
      "app/admin/site-content/new/page.tsx",
      "app/admin/site-content/[id]/page.tsx",
    ];
    const missing = pages.filter(
      // 構文木で見る。コメントに書いた呼び出しを拾う心配が無い（M-022）。
      (rel) => !calls(parse(readFileSync(join(process.cwd(), "src", rel), "utf8")), "requireSiteContentAdmin"),
    );
    expect(missing).toEqual([]);
  });
});

describe("検出器そのものの性質", () => {
  // 構造テストは「その語がソースにある」しか語れない。**述語を値で動かして**
  // 素通りする形が本当に検出されることを確かめる（M-033・型 G）。
  // 入口の `unguardedExports()` をそのまま使う。

  it("結果を捨てる／否定するだけの書き方は「守っている」と見なさない", () => {
    expect(
      unguardedExports('export async function a() { const ok = requirePermission(c, "x:y"); return w(); }'),
    ).toEqual(["a"]);
    expect(
      unguardedExports('export async function a() { const denied = !requirePermission(c, "x:y"); return w(); }'),
    ).toEqual(["a"]);
    expect(
      unguardedExports('export async function a() { if (!requirePermission(c, "x:y")) return err; return w(); }'),
    ).toEqual([]);
  });

  it("弾く分岐が必ず抜けることまで要求する", () => {
    // `if` の**外**の return を拾って素通りしていた（Codex の指摘）。
    expect(
      unguardedExports('export async function a() { if (!requirePermission(c, "x:y")) audit(); return w(); }'),
    ).toEqual(["a"]);
    expect(
      unguardedExports(
        'export async function a() { if (!requirePermission(c, "x:y")) { audit(); return err; } return w(); }',
      ),
    ).toEqual([]);
  });

  it("throw で止めるヘルパーは否定形を求めない", () => {
    // resolveAuthorizedTenantId は返り値ではなく throw で止める。否定を要求すると正解を落とす。
    expect(
      unguardedExports("export async function a() { const t = await resolveAuthorizedTenantId(c); return w(t); }"),
    ).toEqual([]);
  });

  it("arrow で export された Server Action も見る", () => {
    // `function` 宣言だけを見ていたので、まるごと検査対象から消えていた（Codex の指摘）。
    expect(unguardedExports("export const mutate = async () => { return write(); };")).toEqual(["mutate"]);
    expect(
      unguardedExports(
        'export const mutate = async () => { if (!requirePermission(c, "x:y")) return err; return write(); };',
      ),
    ).toEqual([]);
  });

  it("export を1本ずつ見る（他の export のガードを流用しない）", () => {
    const src = `
      async function authorize() {
        if (!requirePermission(caller, "site_content:manage")) return { error: "forbidden" };
        return { caller };
      }
      export async function createAction() { const auth = await authorize(); if (isErr(auth)) return auth; return write(auth); }
      export async function deleteAction() { const auth = await authorize(); if (isErr(auth)) return auth; return write(auth); }
    `;
    expect(unguardedExports(src)).toEqual([]);
    // 1本から委譲を外すと、そこだけが挙がる。
    expect(
      unguardedExports(
        src.replace(
          "export async function deleteAction() { const auth = await authorize(); if (isErr(auth)) return auth; return write(auth); }",
          "export async function deleteAction() { return write(); }",
        ),
      ),
    ).toEqual(["deleteAction"]);
  });

  it("throw しないヘルパーは、結果を見ていなければ守っていない", () => {
    // authorize() は Err を返すだけ。呼んでも結果を捨てれば認可失敗でも書き込む（Codex の指摘）。
    const helper = `
      async function authorize() {
        if (!requirePermission(caller, "x:y")) return { error: "forbidden" };
        return { caller };
      }
    `;
    expect(unguardedExports(`${helper} export async function a() { await authorize(); return write(); }`)).toEqual([
      "a",
    ]);
    expect(
      unguardedExports(
        `${helper} export async function a() { const r = await authorize(); if (isErr(r)) return r; return write(); }`,
      ),
    ).toEqual([]);
  });

  it("同名変数でも、別スコープのガードは流用しない", () => {
    const helper = `
      async function authorize() {
        if (!requirePermission(caller, "x:y")) return { error: "forbidden" };
        return { caller };
      }
    `;
    // 片方のブロックだけがガードしている。もう片方は守られていない。
    const src = `${helper}
      export async function a() {
        if (p) { const auth = await authorize(); if (isErr(auth)) return auth; }
        if (q) { const auth = await authorize(); }
        return write();
      }`;
    // 少なくとも1つの経路が守られているので export 単位では合格になる。
    // ここで固定したいのは「**同じスコープの後ろの文**しか見ない」こと自体。
    expect(
      unguardedExports(
        `${helper} export async function a() { if (q) { const auth = await authorize(); } return write(); }`,
      ),
    ).toEqual(["a"]);
    expect(unguardedExports(src)).toEqual([]);
  });

  it("コメントの中身は最初から見ない（構文木にコメントは無い）", () => {
    expect(
      unguardedExports('export async function a() { /* if (!hasMinRole(r, "staff")) return e; */ return write(); }'),
    ).toEqual(["a"]);
    expect(
      unguardedExports('export async function a() { return write(); } // if (!hasMinRole(r, "staff")) return e;'),
    ).toEqual(["a"]);
  });
});
