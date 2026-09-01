// 法務文書のコピーが Web 側とズレていないことの自己チェック。
// 実行: node apps/mobile/src/lib/legal.check.ts
//
// モバイルは文面を同梱している（API 依存だとアプリと Web の配信時期が
// ずれた瞬間に表示できなくなるため）。同梱する以上、正である
// src/lib/legal/documents.json とのズレを機械的に検出する。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

const web = read("../../../../src/lib/legal/documents.json");
const mobile = read("../constants/legalDocuments.json");

assert.equal(
  mobile,
  web,
  "apps/mobile/src/constants/legalDocuments.json が src/lib/legal/documents.json と一致しません。" +
    "Web 側を編集したら cp src/lib/legal/documents.json apps/mobile/src/constants/legalDocuments.json を実行してください。",
);

const docs = JSON.parse(mobile) as { slug: string; title: string; blocks: unknown[] }[];
assert.deepEqual(
  docs.map((d) => d.slug).sort(),
  ["privacy", "terms"],
  "利用規約とプライバシーポリシーの両方が必要です",
);
for (const d of docs) {
  assert.ok(d.title.length > 0, `${d.slug}: title が空です`);
  assert.ok(d.blocks.length > 0, `${d.slug}: 本文が空です`);
}

console.log("legal documents self-check: OK");
