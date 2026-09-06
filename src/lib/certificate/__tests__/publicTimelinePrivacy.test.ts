/**
 * 公開証明書ページ（`/c/[public_id]`、未認証で開ける）のタイムラインに、
 * **閲覧監査の行を出さない**ことを固定する。
 *
 * 2026-09-06 に PR #1040 で見つけた実在の漏洩:
 * `logCertificateAction` は `description` を省略されると
 * `Public ID: … / User: <uid> / IP: <IP>` を組み立てる。
 * `certificate_public_viewed` / `certificate_public_pdf` は description を渡さず
 * `ip` を渡すので**訪問者の IP** が、`certificate_viewed` には**担当者の uid** が
 * その行に入る。`getPublicCertificateData` は `vehicle_histories` を型で絞らずに
 * 全件引き、`UnifiedTimeline` が `description` をそのまま描画していた。
 *
 * description の書式ではなく**型**で落としているので、この検査も型で見る。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { stripComments } from "@/lib/__tests__/sourceScan";

const REPO = resolve(__dirname, "../../../..");
const FILE = "src/lib/certificate/publicData.ts";
/**
 * **コメントを落としてから照合する**（`sourceScan.ts` の規約）。
 * このファイルが検査する `publicData.ts` は、除外する型名を説明コメントにも書いている。
 * 生ソースのまま見ると、**配列からコメントアウトで型を外しても検査が緑のまま**になる
 * （この repo が2回やっている形。M-022 / M-033）。
 */
const SRC = stripComments(readFileSync(join(REPO, FILE), "utf8"), FILE);

/** `logCertificateAction` の既定 description に uid / IP が入る監査種別。 */
const MUST_BE_PRIVATE = [
  "certificate_viewed",
  "certificate_pdf_generated",
  "certificate_pdf_batch",
  "certificate_public_viewed",
  "certificate_public_pdf",
];

/** 車両の出来事なので公開してよい種別。除外リストに混ぜたら落とす。 */
const MUST_STAY_PUBLIC = ["certificate_issued", "certificate_edited", "certificate_voided"];

describe("公開タイムラインの閲覧監査除外", () => {
  const block = SRC.match(/const PRIVATE_HISTORY_TYPES\s*=\s*\[([\s\S]*?)\]/);

  it("除外リストが存在する", () => {
    expect(block, "PRIVATE_HISTORY_TYPES が消えている（公開ページに監査行が戻る）").not.toBeNull();
  });

  it.each(MUST_BE_PRIVATE)("%s を公開タイムラインから除外している", (t) => {
    expect(block![1], `${t} が除外リストから外れている。既定 description に uid / IP が入る`).toContain(t);
  });

  it.each(MUST_STAY_PUBLIC)("%s は公開したままにする", (t) => {
    expect(block![1], `${t} は車両の出来事なので公開タイムラインに残す`).not.toContain(t);
  });

  // `.not("type","in",…)` だけだと `NULL NOT IN (…)` が偽になり、
  // type が空の旧スキーマ行まで公開タイムラインから消える。
  it("type が NULL の行は落とさない", () => {
    expect(SRC, "NULL 行が巻き添えで消える書き方に戻っている").toMatch(/\.or\(\s*[`'"]type\.is\.null,type\.not\.in\./);
  });

  // 検査が空振りしていないことを確かめる（型 A）。
  it("実際にクエリへ適用されている", () => {
    const query = SRC.slice(SRC.indexOf('.from("vehicle_histories")'));
    expect(query, "vehicle_histories のクエリが見つからない").not.toBe("");
    expect(query.slice(0, 1500), "除外がクエリに掛かっていない（定数だけ置いて使っていない）").toContain(
      "PRIVATE_HISTORY_TYPES",
    );
  });
});
