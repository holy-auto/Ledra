/**
 * 車両履歴をテナント外（顧客・第三者）に出す経路が、**許可リストで絞っているか**を固定する。
 *
 * ## なぜ漏れたか
 *
 * `vehicle_histories` は**車両の履歴**と**監査ログ**が同じテーブルに同居している。
 * `logCertificateAction` は `description` を省略されると
 * `Public ID: … / User: <uid> / IP: <IP>` を組み立てるので、閲覧監査の行には
 * **訪問者の IP** と**店舗スタッフの uid** が入る。
 *
 * 書く側は少ないが、**読む側は複数ある**。PR #1040 は公開ページ側だけを直し、
 * 顧客ポータル側が残っていた（本番で14行が顧客に見えていた。M-076）。
 *
 * さらに最初の修正は「見せない5種別」を並べる**除外リスト**で、既定が公開だった。
 * `member_added`（メールアドレス）・`note`（パスポート移転先のメール）・
 * `ai_auto_action_executed`（union にすら無い種別）はどれも素通りする。M-077。
 *
 * **この2つを検査にする。** 読み手を数え落とさないこと、許可リストで絞ること。
 *
 * #1040 の回帰テスト（`certificates/__tests__/publicTimelinePrivacy.test.ts`）は
 * ここへ統合した。許可リストを3種別に固定する上の検査が、あちらの
 * 「5種別を除外している」「発行・編集・無効化は残す」の両方を含むため
 * （除外リストと違い、**3つに固定＝残り全部を落とす**が同じ1つの表明になる）。
 * 同じ種別名を2つのテストに書き写すのは、この PR が直している重複そのものだった。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OUTWARD_VISIBLE_TYPES } from "../certificateLog";
import { parse, collect, calleeName } from "@/lib/__tests__/astScan";
import ts from "typescript";

const REPO = process.cwd();

/** `vehicle_histories` を読んで**テナント外**（公開・顧客）へ出す経路。 */
const OUTWARD_READERS = [
  "src/lib/certificates/publicData.ts", // /c/[public_id]（未認証）
  "src/lib/customerPortalServer.ts", // /api/customer/list, /api/customer/data-export
];

/**
 * テナント外へ出さない経路（書き込み、管理画面、同一テナント向け API）。
 *
 * **この2つの一覧に載っていないファイルが現れたら落とす。** 分類を強制するため。
 * 「読み手を1つ数え落とす」が M-076 の形なので、一覧の維持を人の記憶に任せない。
 */
const INTERNAL = [
  "src/app/admin/audit/page.tsx",
  "src/app/admin/vehicles/[id]/page.tsx",
  "src/app/api/admin/data-export/route.ts",
  "src/app/api/admin/organizations/[id]/stores/[tenantId]/work-history/route.ts",
  "src/app/api/admin/platform/store-usage/route.ts",
  "src/app/api/admin/reservations/[id]/advance/route.ts",
  "src/app/api/admin/thickness-reports/[reportId]/link/route.ts",
  "src/app/api/external/nexptg/sync/route.ts",
  "src/app/api/mobile/progress/[reservationId]/route.ts",
  "src/app/api/mobile/reservations/[id]/advance/route.ts",
  "src/lib/audit/aiAuditLog.ts",
  "src/lib/audit/certificateLog.ts",
  "src/lib/certificates/create.ts",
];

/**
 * `vehicle_histories` に触っている実ファイルを**列挙する**（テスト自身は除く）。
 *
 * `git grep` ではなくファイルを歩く。git の管理下にあるかどうかは、
 * 「その経路が外に出るか」と何の関係もないため —— 実際、最初は `git grep` で
 * 書いていて、**未追跡の新規ファイルを取りこぼした**（変異(d)が緑になった）。
 */
function filesTouchingVehicleHistories(): string[] {
  return readdirSync(join(REPO, "src"), { recursive: true, encoding: "utf8" })
    .map((f) => `src/${String(f).split("\\").join("/")}`)
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("__tests__"))
    .filter((f) => readFileSync(join(REPO, f), "utf8").includes('from("vehicle_histories")'))
    .sort();
}

/** その節点が `.in("type", OUTWARD_VISIBLE_TYPES)` か。 */
function isTypeAllowlistCall(c: ts.CallExpression): boolean {
  if (calleeName(c) !== "in") return false;
  const [col, list] = c.arguments;
  return (
    !!col &&
    ts.isStringLiteral(col) &&
    col.text === "type" &&
    !!list &&
    ts.isIdentifier(list) &&
    list.text === "OUTWARD_VISIBLE_TYPES"
  );
}

/**
 * そのソースの `vehicle_histories` クエリ数と、許可リストを掛けた回数。
 *
 * ponytail: ファイル単位で**数を突き合わせる**だけの素朴な判定。クエリと
 * ガードの対応までは見ないので、「1本に2回掛けて、もう1本は素通り」は拾えない。
 * 鎖を辿る方式にすると `let q = db.from(…); q = q.in(…)` の書き方（この repo の
 * 他の場所で実際に使っている）を誤検出するため、数合わせを選んでいる。
 * 対応まで見たくなったら、読み出しを1つの関数に集約してそこを見る方が確実。
 */
function counts(src: string, fileName: string): { queries: number; guards: number } {
  const calls = collect(parse(src, fileName), ts.isCallExpression);
  const queries = calls.filter(
    (c) =>
      calleeName(c) === "from" &&
      c.arguments[0] &&
      ts.isStringLiteral(c.arguments[0]) &&
      (c.arguments[0] as ts.StringLiteral).text === "vehicle_histories",
  ).length;
  return { queries, guards: calls.filter(isTypeAllowlistCall).length };
}

describe("車両履歴をテナント外に出す経路", () => {
  it("外へ出してよい種別は、車両に起きたこと3種別だけ", () => {
    // 増やすときは「顧客・第三者に見せてよいか」を考えること。
    // description に個人情報が入る種別を足すと、ここが落ちる。
    expect([...OUTWARD_VISIBLE_TYPES]).toEqual(["certificate_issued", "certificate_edited", "certificate_voided"]);
  });

  it("vehicle_histories に触るファイルは、すべて分類済み", () => {
    // 新しい読み手が増えたらここで落ちる。落ちたら OUTWARD_READERS か
    // INTERNAL のどちらかに入れる —— 入れるときに「外に出るか」を必ず考える。
    const known = [...OUTWARD_READERS, ...INTERNAL].sort();
    expect(filesTouchingVehicleHistories()).toEqual(known);
  });

  it.each(OUTWARD_READERS)("%s は全クエリに許可リストを掛けている", (rel) => {
    const abs = join(REPO, rel);
    const { queries, guards } = counts(readFileSync(abs, "utf8"), abs);
    expect(queries, `${rel} に vehicle_histories のクエリが無い（検出器の空振り）`).toBeGreaterThan(0);
    expect(guards, `${rel}: クエリ ${queries} 本に対して許可リストが ${guards} 箇所`).toBeGreaterThanOrEqual(queries);
  });

  it("検出器が空振りしていない", () => {
    const guarded = `db.from("vehicle_histories").select("id").in("type", OUTWARD_VISIBLE_TYPES);`;
    expect(counts(guarded, "x.ts")).toEqual({ queries: 1, guards: 1 });

    // ガード無し → 拾える
    expect(counts(`db.from("vehicle_histories").select("id, description");`, "x.ts").guards).toBe(0);

    // 2本目が素通り → 数が足りない（`.some()` だと緑になっていた形）
    expect(counts(`${guarded} db.from("vehicle_histories").select("id, description");`, "x.ts")).toEqual({
      queries: 2,
      guards: 1,
    });

    // 定数を別の場所で言及しているだけ → ガードに数えない
    expect(counts(`db.from("vehicle_histories").select(OUTWARD_VISIBLE_TYPES);`, "x.ts").guards).toBe(0);
    expect(counts(`db.from("vehicle_histories").in("status", OUTWARD_VISIBLE_TYPES);`, "x.ts").guards).toBe(0);

    // 再代入で組み立てる書き方（この repo の他所で実際に使っている）も認める
    const reassigned = `
      let q = db.from("vehicle_histories").select("id");
      q = q.in("type", OUTWARD_VISIBLE_TYPES);
      const { data } = await q;
    `;
    expect(counts(reassigned, "x.ts")).toEqual({ queries: 1, guards: 1 });
  });
});
