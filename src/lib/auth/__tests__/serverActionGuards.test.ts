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
 * 認可が**制御フローを変えている**か。
 *
 * 段階的に2回甘かった。呼び出しの存在だけを見ていた頃は
 * `const ok = requirePermission(...)` で素通りし、否定形まで求めた後も
 * `const denied = !requirePermission(...)` で素通りした（どちらも Codex の指摘）。
 * **否定が return / throw に繋がっている**ことまで見る。
 *
 * `resolveAuthorizedTenantId(` だけは別扱い。**返り値ではなく throw で止める**ので、
 * 否定を要求すると正しい書き方を落とす。
 */
const BOOLEAN_GUARD =
  /if\s*\(\s*!\s*(?:requirePermission|requireMinRole|hasPermission|hasMinRole|isPlatformAdmin)\s*\([\s\S]{0,300}?\b(?:return|throw)\b/;
const THROWING_GUARD = /resolveAuthorizedTenantId\s*\(/;

function guardsDirectly(body: string): boolean {
  return BOOLEAN_GUARD.test(body) || THROWING_GUARD.test(body);
}

/**
 * 本文の `{` の位置。**引数リストと返り値型の注釈を跨いで**探す。見つからなければ -1。
 *
 * 2回間違えた。素朴に「名前の後の最初の `{`」を取ると
 * `): Promise<ActionResult<{ id: string }>> {` の**型の中の `{`**を本文と読む。
 * 次に山括弧だけ数えたら、今度は型の中の `;` で打ち切って **-1 を返し、
 * 呼び出し側がその export を黙って検査対象から外した**（変異テストで発覚）。
 * 山括弧と波括弧の**両方**の深さが 0 のところだけを本文の始まりとする。
 */
function bodyStart(src: string, from: number): number {
  let i = src.indexOf("(", from);
  if (i < 0) return -1;
  let paren = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") paren++;
    else if (src[i] === ")" && --paren === 0) {
      i++;
      break;
    }
  }
  let angle = 0;
  let brace = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "<") angle++;
    else if (c === ">") angle = Math.max(0, angle - 1);
    else if (c === "{") {
      if (angle === 0 && brace === 0) return i;
      brace++;
    } else if (c === "}") brace = Math.max(0, brace - 1);
    else if (c === ";" && angle === 0 && brace === 0) return -1; // 宣言だけ（本文が無い）
  }
  return -1;
}

/** `function name(...) { ... }` を名前・export の有無・本文に切る。切れなければ body は null。 */
function namedFunctions(src: string): { name: string; exported: boolean; body: string | null }[] {
  const out: { name: string; exported: boolean; body: string | null }[] = [];
  for (const m of src.matchAll(/(export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g)) {
    const open = bodyStart(src, (m.index ?? 0) + m[0].length - 1);
    if (open < 0) {
      out.push({ name: m[2], exported: Boolean(m[1]), body: null });
      continue;
    }
    let depth = 0;
    let end = src.length;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    out.push({ name: m[2], exported: Boolean(m[1]), body: src.slice(open, end) });
  }
  return out;
}

/**
 * **export された Server Action を1本ずつ**見る。
 *
 * ファイル全体で1回でもガードが見つかれば合格にしていたので、4本ある export の
 * 1本からガードを外しても、他の3本のガードで緑のままだった（Codex の指摘）。
 * これは `sourceScan.handlerChunks` が route.ts で先に踏んだのと同じ形である。
 *
 * `site-content/actions.ts` のように**ファイル内のヘルパー（`authorize()`）へ
 * 委ねる**形が正しいので、直接のガードだけでなく「ガードを持つヘルパーの呼び出し」も認める。
 */
function unguardedExports(src: string): string[] {
  const fns = namedFunctions(src);
  const helpers = fns.filter((f) => !f.exported && f.body !== null && guardsDirectly(f.body)).map((f) => f.name);
  return fns
    .filter((f) => f.exported)
    .flatMap((f) => {
      // **本文を切り出せないものを黙って飛ばさない。** 飛ばすと検査対象から消え、
      // その export の認可を外しても緑になる（実際そうなっていた）。
      if (f.body === null) return [`${f.name}（本文を切り出せない）`];
      if (guardsDirectly(f.body)) return [];
      if (helpers.some((h) => new RegExp(String.raw`\b${h}\s*\(`).test(f.body as string))) return [];
      return [f.name];
    });
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
      .flatMap((f) => unguardedExports(stripComments(f.src)).map((name) => `${f.rel} :: ${name}`))
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
    expect(guardsDirectly('const ok = requirePermission(caller, "site_content:manage");')).toBe(false);
    // 否定しただけで制御フローを変えない形。以前はこれが緑だった（Codex の指摘）。
    expect(guardsDirectly('const denied = !requirePermission(caller, "site_content:manage");\nwrite();')).toBe(false);
    expect(
      guardsDirectly('if (!requirePermission(caller, "site_content:manage")) return { error: "forbidden" };'),
    ).toBe(true);
    expect(guardsDirectly('if (!requireMinRole(caller, "admin")) throw new Error("forbidden");')).toBe(true);
  });

  it("throw で止めるヘルパーは否定形を求めない", () => {
    // resolveAuthorizedTenantId は返り値ではなく throw で止める。否定を要求すると正解を落とす。
    expect(guardsDirectly("const tenantId = await resolveAuthorizedTenantId(caller);")).toBe(true);
  });

  it("本文を切り出せない export は黙って飛ばさず、落とす", () => {
    // 飛ばすと検査対象から消える。分からないものは合格に倒さない。
    expect(unguardedExports("export async function act(fd: FormData): Promise<void>;")).toEqual([
      "act（本文を切り出せない）",
    ]);
  });

  it("返り値型の中の波括弧を本文と読み違えない", () => {
    // `): Promise<ActionResult<{ id: string }>> {` で実際に誤判定した。
    const src = `
      export async function act(
        fd: FormData,
      ): Promise<ActionResult<{ id: string; type: string }>> {
        if (!requirePermission(caller, "x:y")) return { error: "forbidden" };
        return write(fd);
      }
    `;
    expect(unguardedExports(src)).toEqual([]);
  });

  it("export された Server Action を1本ずつ見る", () => {
    // ファイル単位だと、4本のうち1本からガードを外しても他の3本で緑になる（Codex の指摘）。
    const src = `
      async function authorize() {
        if (!requirePermission(caller, "site_content:manage")) return { error: "forbidden" };
        return { caller };
      }
      export async function createAction() { const auth = await authorize(); return write(auth); }
      export async function deleteAction() { return write(); }
    `;
    expect(unguardedExports(src)).toEqual(["deleteAction"]);
    // ヘルパー経由でも守られていれば通す（site-content/actions.ts の実際の形）。
    expect(unguardedExports(src.replace("export async function deleteAction() { return write(); }", ""))).toEqual([]);
  });

  it("コメントの引用では通さない", () => {
    // 以前ここで実際にやらかしている（説明コメントの `hasMinRole(role, "staff")` に反応した）。
    expect(guardsDirectly(stripComments('// if (!hasMinRole(role, "staff")) で弾いていた\nawait doSomething();'))).toBe(
      false,
    );
  });
});
