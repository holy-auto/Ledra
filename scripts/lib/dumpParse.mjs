/**
 * `pg_dump --schema-only` の出力から名前を拾う純関数。
 *
 * `check-schema-drift.mjs` はトップレベルで再生と本番問い合わせを走らせるので、
 * 解析だけを試したくても import できない。**解析は解析として試せるように**ここへ出す。
 */

/** `"name"` → `name`（引用符を外し、`""` を `"` に戻し、小文字化）。 */
export const bare = (s) => s.replace(/^"|"$/g, "").replace(/""/g, '"').toLowerCase();

/**
 * 一意制約の名前を `表名.制約名` で拾う。
 *
 * pg_dump は一意制約を**2つの書き方**で出す。**両方拾わないと幻のドリフトになる**
 * （片方しか見ないと、もう片方の形で持っているものが「無い」と出続ける）。
 *   - 索引として持つもの: `CREATE UNIQUE INDEX <名前> ON public.<表> ...`
 *   - 制約として持つもの: `ALTER TABLE ONLY public.<表>\n    ADD CONSTRAINT <名前> UNIQUE (...)`
 *
 * PRIMARY KEY は含めない（本番側のクエリも `indisprimary` を除いている）。
 * `CONCURRENTLY` / `IF NOT EXISTS` は pg_dump は出さないが、手書きの SQL を
 * そのまま通したくなる場面があるので読めるようにしてある。
 */
export function uniqueFromDump(text) {
  const out = new Set();
  for (const m of text.matchAll(
    /^CREATE UNIQUE INDEX (?:CONCURRENTLY )?(?:IF NOT EXISTS )?([\w"]+) ON public\.([\w"]+)/gm,
  )) {
    out.add(`${bare(m[2])}.${bare(m[1])}`);
  }
  for (const m of text.matchAll(
    /^ALTER TABLE (?:ONLY )?public\.([\w"]+)\s*\n\s*ADD CONSTRAINT ([\w"]+) UNIQUE[ (]/gm,
  )) {
    out.add(`${bare(m[1])}.${bare(m[2])}`);
  }
  return out;
}

/**
 * 制約の名前を `表名.制約名` で拾う。`kind` は 'FOREIGN KEY' か 'CHECK'。
 *
 * pg_dump は制約を `ALTER TABLE ONLY public.<表>\n    ADD CONSTRAINT <名前> <種類> ...` で出す。
 * **CHECK は列定義の中にインラインでも書かれる**が、その形は名前を持たない匿名制約か、
 * `CONSTRAINT <名前> CHECK (...)` として CREATE TABLE の中に現れる。後者も拾う ——
 * 拾い漏らすと「本番にあって再生に無い」と出続ける幻のドリフトになる。
 */
export function constraintsFromDump(text, kind) {
  const out = new Set();
  const alterRe = new RegExp(
    `^ALTER TABLE (?:ONLY )?public\\.([\\w"]+)\\s*\\n\\s*ADD CONSTRAINT ([\\w"]+) ${kind}[ (]`,
    "gm",
  );
  for (const m of text.matchAll(alterRe)) out.add(`${bare(m[1])}.${bare(m[2])}`);

  if (kind === "CHECK") {
    // CREATE TABLE の中の `CONSTRAINT <名前> CHECK (` も拾う。
    const tableRe = /^CREATE (?:UNLOGGED )?TABLE (?:ONLY )?public\.([\w"]+) \(\n([\s\S]*?)^\)/gm;
    for (const m of text.matchAll(tableRe)) {
      const table = bare(m[1]);
      for (const c of m[2].matchAll(/^\s*CONSTRAINT ([\w"]+) CHECK[ (]/gm)) {
        out.add(`${table}.${bare(c[1])}`);
      }
    }
  }
  return out;
}
