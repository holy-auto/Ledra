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
import { walkSource, stripComments } from "@/lib/__tests__/sourceScan";
import { hasPermission } from "@/lib/auth/permissions";

const APP_ROOT = join(process.cwd(), "src", "app");

/**
 * 認可で**弾いている**か。
 *
 * 以前は呼び出しの存在だけを見ていたので、`const ok = requirePermission(...)` のように
 * **結果を捨てる書き方でも合格**した。真偽値を返すヘルパーは否定形（`!helper(...)`）まで
 * 要求する —— `apiRoutePermissions.test.ts` の `enforces()` と同じ形に揃えた
 * （MISTAKE_LEDGER M-033・型 G の棚卸し。現行3ファイルはいずれも既に否定形だった）。
 *
 * `resolveAuthorizedTenantId(` だけは別扱い。**返り値ではなく throw で止める**ので、
 * 否定を要求すると正しい書き方を落とす。
 */
const BOOLEAN_GUARD = /!\s*(?:requirePermission|requireMinRole|hasPermission|hasMinRole|isPlatformAdmin)\s*\(/;
const THROWING_GUARD = /resolveAuthorizedTenantId\s*\(/;

function guards(src: string): boolean {
  const stripped = stripComments(src);
  return BOOLEAN_GUARD.test(stripped) || THROWING_GUARD.test(stripped);
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
      .filter((f) => !EXEMPT.has(f.rel) && !guards(f.src))
      .map((f) => f.rel)
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
      // M-022 と同じ罠を避ける: 説明コメントに書いた呼び出しを拾わないよう落としてから見る。
      (rel) =>
        !/requireSiteContentAdmin\s*\(/.test(stripComments(readFileSync(join(process.cwd(), "src", rel), "utf8"))),
    );
    expect(missing).toEqual([]);
  });
});

describe("検出器そのものの性質", () => {
  // 「呼んでいる」と「弾いている」は別。述語を値で動かして確かめる（M-033・型 G）。
  it("結果を捨てる書き方は「守っている」と見なさない", () => {
    expect(guards('const ok = requirePermission(caller, "site_content:manage");')).toBe(false);
    expect(guards('if (!requirePermission(caller, "site_content:manage")) return { error: "forbidden" };')).toBe(true);
    expect(guards('const ok = requireMinRole(caller, "admin");')).toBe(false);
    expect(guards('if (!requireMinRole(caller, "admin")) throw new Error("forbidden");')).toBe(true);
  });

  it("throw で止めるヘルパーは否定形を求めない", () => {
    // resolveAuthorizedTenantId は返り値ではなく throw で止める。否定を要求すると正解を落とす。
    expect(guards("const tenantId = await resolveAuthorizedTenantId(caller);")).toBe(true);
  });

  it("コメントの引用では通さない", () => {
    // 以前ここで実際にやらかしている（説明コメントの `hasMinRole(role, "staff")` に反応した）。
    expect(guards('// 以前は if (!hasMinRole(role, "staff")) で弾いていた\nawait doSomething();')).toBe(false);
  });
});
