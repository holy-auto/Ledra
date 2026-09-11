/**
 * 閲覧監査の行を、テナント外の相手に見せないことを固定する。
 *
 * ## なぜ漏れたか
 *
 * `vehicle_histories` は**車両の履歴**と**監査ログ**が同じテーブルに同居している。
 * `logCertificateAction` は `description` を省略されると
 * `Public ID: … / User: <uid> / IP: <IP>` を組み立てるので、閲覧監査の行には
 * **訪問者の IP** と**店舗スタッフの uid** が入る。
 *
 * 書く側は1つ（`logCertificateAction`）だが、**読む側は複数ある**。
 * PR #1040 は公開ページ側だけを直し、顧客ポータル側が残っていた。本番では
 * 14行（IP 6 / uid 8、9証明書・4テナント）がログイン済み顧客に見えていた。
 *
 * **「呼び出し元を全部見る」をテストにする。** 型で落としているかを読み手ごとに見る。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVATE_AUDIT_TYPES, EXCLUDE_PRIVATE_AUDIT_FILTER } from "../certificateLog";
import { parse, collect, calleeName } from "@/lib/__tests__/astScan";
import ts from "typescript";

/**
 * `vehicle_histories` を読んで**テナント外**（公開・顧客）へ出す経路。
 *
 * 管理画面（`src/app/admin/**`）と店舗向け API は同じテナントの人が見るので対象外。
 * 新しい経路を足したらここに足す —— 足さずに済ませると、この検査は空振りする。
 */
const OUTWARD_READERS = [
  "src/lib/certificates/publicData.ts", // /c/[public_id]（未認証）
  "src/lib/customerPortalServer.ts", // /api/customer/list, /api/customer/data-export
];

/** そのファイルの `.from("vehicle_histories")` に続く鎖が、除外フィルタを掛けているか。 */
function filtersPrivateAudit(src: string, fileName: string): boolean {
  const tree = parse(src, fileName);
  return collect(tree, ts.isCallExpression).some((call) => {
    if (calleeName(call) !== "from") return false;
    const arg = call.arguments[0];
    if (!arg || !ts.isStringLiteral(arg) || arg.text !== "vehicle_histories") return false;
    // `.from("vehicle_histories")` を含む式全体（メソッド鎖）を見る。
    let chain: ts.Node = call;
    while (chain.parent && (ts.isPropertyAccessExpression(chain.parent) || ts.isCallExpression(chain.parent))) {
      chain = chain.parent;
    }
    return collect(chain, ts.isIdentifier).some((id) => id.text === "EXCLUDE_PRIVATE_AUDIT_FILTER");
  });
}

describe("閲覧監査の行をテナント外に出さない", () => {
  it("除外する型は、uid / IP が本文に入る5種別すべて", () => {
    // `logCertificateAction` が既定の description を組み立てるのはこの5種別。
    // 増やしたらここが落ちるので、落ちたら除外側にも足すこと。
    expect([...PRIVATE_AUDIT_TYPES]).toEqual([
      "certificate_viewed",
      "certificate_pdf_generated",
      "certificate_pdf_batch",
      "certificate_public_viewed",
      "certificate_public_pdf",
    ]);
  });

  it("フィルタは type が NULL の旧行を落とさない", () => {
    // `.not("type","in",…)` 単体だと SQL の `NULL NOT IN (…)` が偽になり、
    // type が空の旧スキーマ行まで消える（描画側は NULL を想定している）。
    expect(EXCLUDE_PRIVATE_AUDIT_FILTER).toMatch(/^type\.is\.null,/);
    for (const t of PRIVATE_AUDIT_TYPES) expect(EXCLUDE_PRIVATE_AUDIT_FILTER).toContain(t);
  });

  it.each(OUTWARD_READERS)("%s が除外フィルタを掛けている", (rel) => {
    const abs = join(process.cwd(), rel);
    expect(filtersPrivateAudit(readFileSync(abs, "utf8"), abs), `${rel} の vehicle_histories クエリに除外が無い`).toBe(
      true,
    );
  });

  it("検出器が空振りしていない（フィルタの無いクエリを拾えること）", () => {
    // 上の検査が「クエリを見つけられなかった」で緑になっていないことを確かめる。
    const unfiltered = `
      const { data } = await db
        .from("vehicle_histories")
        .select("id, description")
        .eq("tenant_id", tenantId);
    `;
    expect(filtersPrivateAudit(unfiltered, "x.ts")).toBe(false);
    const filtered = unfiltered.replace('.eq("tenant_id", tenantId)', ".or(EXCLUDE_PRIVATE_AUDIT_FILTER)");
    expect(filtersPrivateAudit(filtered, "x.ts")).toBe(true);
  });
});
