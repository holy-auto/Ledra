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

/**
 * `CREATE TABLE public.x ( ... );` の中身から列を1列ずつ `{name, type, notnull}` で拾う。
 * name = `表名.列名`（bare で小文字化）、type = 宣言型の先頭トークン（bare＋`public.` 剥がし）、
 * notnull = その列定義に `NOT NULL` が付くか（真偽）。
 *
 * pg_dump は1列1行で書くが、`GENERATED ALWAYS AS (CASE WHEN ... END)` のように式が
 * 複数行に折り返る。括弧の深さを追い、**深さ0で始まる行を列の開始**として扱い、続く
 * 深さ>0 の折り返し行はその列定義へ連結する（折り返し行の WHEN/ELSE を列と誤認しないため。
 * 実際に4件誤検出して pg_attribute と突き合わせて気づいた）。`NOT NULL` は折り返しの末尾
 * （`... END) STORED NOT NULL`）に来ることがあるので、**連結後の全文**で判定する。
 * CONSTRAINT / PRIMARY / UNIQUE / CHECK / FOREIGN / EXCLUDE / LIKE 始まりの行は制約なので除く。
 *
 * type は enum ドリフト判定にしか使わないので先頭トークンで十分（`character varying(255)` の
 * 先頭語 `character` はどの enum 名とも一致せず誤検出しない）。pg_dump は public の enum を
 * `public.x_enum` と修飾するので剥がして enum 名だけ残す。
 *
 * ponytail: notnull 判定は（1）文字列リテラルを潰し（2）括弧で囲まれた式を剥がしてから
 *   `\bNOT NULL\b` を見る。式を剥がすのが要点 —— `GENERATED ALWAYS AS (CASE WHEN x IS NOT NULL
 *   ... ELSE NULL END) STORED` のような**式の中の `IS NOT NULL`** を列の NOT NULL 制約と読み違えると、
 *   null 許容の生成列を「再生 NOT NULL / 本番 NULL 可」の実害ドリフトとして誤報する（実例
 *   service_reminders.next_due_mileage / next_due_date）。列の NOT NULL 制約は常に深さ0に出るので、
 *   括弧内（GENERATED 式・DEFAULT 関数の引数・CHECK）を落とせば top-level の宣言だけが残る。
 *   リテラルを先に潰すのは、`DEFAULT '('::text` のように文字列内の括弧が剥がしを壊さないため。
 *   主キー列は pg_dump が列行に `NOT NULL` を明記する（`id uuid DEFAULT ... NOT NULL`）ので真になる。
 *   本番側も attnotnull が真なので一致し、ドリフトにはならない。
 *
 * 列名の集合だけ欲しいときは `new Set(columnRowsFromDump(t).map((r) => r.name))`。
 */
export function columnRowsFromDump(text) {
  const rows = [];
  const re = /^CREATE (?:UNLOGGED )?TABLE (?:ONLY )?public\.([\w"]+) \(\n([\s\S]*?)^\)/gm;
  for (const m of text.matchAll(re)) {
    const table = bare(m[1]);
    // 物理行を論理行（深さ0で始まる行＋その続きの折り返し行）へまとめる。
    const logical = [];
    let depth = 0;
    for (const raw of m[2].split("\n")) {
      const startDepth = depth;
      let inStr = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (inStr) {
          if (ch === "'") inStr = raw[i + 1] === "'" ? (i++, true) : false;
          continue;
        }
        if (ch === "'") inStr = true;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      if (startDepth === 0) logical.push(raw);
      else if (logical.length) logical[logical.length - 1] += "\n" + raw; // 前の列定義の折り返し
    }
    for (const chunk of logical) {
      const line = chunk.trim();
      if (!line) continue;
      if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)\b/i.test(line)) continue;
      const mm = line.match(/^"?(\w+)"?\s+((?:public\.)?"?\w+"?)/);
      if (!mm) continue;
      // 文字列リテラル→括弧内の式、の順に落としてから NOT NULL を見る（上の ponytail 参照）。
      let flat = line.replace(/'(?:[^']|'')*'/g, "''");
      let prev;
      do {
        prev = flat;
        flat = flat.replace(/\([^()]*\)/g, " "); // 最内の括弧から外へ、無くなるまで
      } while (flat !== prev);
      rows.push({
        name: `${table}.${bare(mm[1])}`,
        type: bare(mm[2]).replace(/^public\./, ""),
        notnull: /\bNOT\s+NULL\b/i.test(flat),
      });
    }
  }
  return rows;
}

/**
 * 列の NULL 可否ドリフトを両方向で仕分ける純関数。**両側に在る列だけ**を見る
 * （片側にしか無い列は表・列名のドリフトが別途拾う。ここは「列は在るが NULL 可否が違う」専任）。
 *
 * 引数は `Map<"表名.列名", notnull:boolean>`。
 *   replay … columnRowsFromDump 由来（マイグレーションを再生した DB）
 *   prod   … 本番 `pg_attribute.attnotnull` 由来
 *
 * 返り値（col 名の配列・ソート済み）:
 *   prodStrict   … 本番 NOT NULL / 再生 NULL 可。**本番では no-op**（本番は既に弾く）だが、
 *                  再生・プレビュー・新環境は NULL を受け入れてしまう。
 *   replayStrict … 再生 NOT NULL / 本番 NULL 可。**実害**: 本番で通る INSERT が再生・プレビューで
 *                  23502 になる（実例 audit_logs.tenant_id —— 本番 349 行中 337 行が NULL）。
 */
export function nullabilityDrift(replay, prod) {
  const prodStrict = [];
  const replayStrict = [];
  for (const [col, rNotNull] of replay) {
    if (!prod.has(col)) continue;
    const pNotNull = prod.get(col);
    if (pNotNull && !rNotNull) prodStrict.push(col);
    else if (!pNotNull && rNotNull) replayStrict.push(col);
  }
  return { prodStrict: prodStrict.sort(), replayStrict: replayStrict.sort() };
}
