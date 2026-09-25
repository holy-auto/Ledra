/**
 * `scripts/lib/dumpParse.mjs` の **一意制約の拾い方** のテスト。
 *
 * なぜ要るか: `check-schema-drift.mjs` は「本番にあってマイグレーションが作らない」
 * 一意制約を落とす。拾い漏らすと**永久に消えない幻のドリフト**になり、
 * 逆に拾いすぎると**本物の欠落が埋もれる**。どちらも検査そのものを無意味にする。
 *
 * pg_dump は一意制約を2つの書き方で出す（`CREATE UNIQUE INDEX` と
 * `ADD CONSTRAINT ... UNIQUE`）。**片方しか読めない解析でも、もう片方の形が
 * 1件も無いスキーマなら緑になる** —— だから両方を1件ずつ固定する。
 *
 * 実スキーマとの照合は本体が見る（2026-09-21 に再生 DB の dump 全体で確認:
 * 解析 135 件 = `pg_index` の 135 件、差分 0）。ここは書き方の読み分けだけ。
 */
import { describe, it, expect } from "vitest";
import { uniqueFromDump, constraintsFromDump, columnRowsFromDump } from "../lib/dumpParse.mjs";

const DUMP = `
CREATE TABLE public.tenants (
    id uuid NOT NULL,
    slug text NOT NULL,
    CONSTRAINT tenants_slug_length CHECK ((char_length(slug) > 0))
);

CREATE UNIQUE INDEX vehicles_public_id_uidx ON public.vehicles USING btree (public_id);

CREATE INDEX idx_vehicles_tenant_id ON public.vehicles USING btree (tenant_id);

CREATE UNIQUE INDEX tenants_custom_domain_uniq ON public.tenants USING btree (lower(custom_domain)) WHERE (custom_domain IS NOT NULL);

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text])));
`;

describe("uniqueFromDump（pg_dump から一意制約を拾う）", () => {
  const found = uniqueFromDump(DUMP);

  it("CREATE UNIQUE INDEX 由来を 表名.制約名 で拾う", () => {
    expect(found.has("vehicles.vehicles_public_id_uidx")).toBe(true);
  });

  it("式索引・部分索引でも拾う", () => {
    expect(found.has("tenants.tenants_custom_domain_uniq")).toBe(true);
  });

  it("ADD CONSTRAINT ... UNIQUE 由来も拾う（行をまたぐ書き方）", () => {
    expect(found.has("tenants.tenants_slug_key")).toBe(true);
  });

  it("PRIMARY KEY は拾わない（本番側も indisprimary を除いている）", () => {
    expect(found.has("tenants.tenants_pkey")).toBe(false);
  });

  it("一意でない索引は拾わない", () => {
    expect(found.has("vehicles.idx_vehicles_tenant_id")).toBe(false);
  });

  it("外部キー制約を UNIQUE と読み違えない", () => {
    expect([...found].some((k) => k.includes("fkey"))).toBe(false);
  });

  it("拾うのは3件だけ（件数も固定する）", () => {
    expect([...found].sort()).toEqual([
      "tenants.tenants_custom_domain_uniq",
      "tenants.tenants_slug_key",
      "vehicles.vehicles_public_id_uidx",
    ]);
  });
});

describe("constraintsFromDump（pg_dump から外部キー・CHECK を拾う）", () => {
  const fks = constraintsFromDump(DUMP, "FOREIGN KEY");
  const checks = constraintsFromDump(DUMP, "CHECK");

  it("外部キーを 表名.制約名 で拾う", () => {
    expect([...fks]).toEqual(["documents.documents_tenant_id_fkey"]);
  });

  it("ALTER TABLE 由来の CHECK を拾う", () => {
    expect(checks.has("documents.documents_status_check")).toBe(true);
  });

  it("**CREATE TABLE の中に書かれた CHECK も拾う**（書き方が2つある）", () => {
    expect(checks.has("tenants.tenants_slug_length")).toBe(true);
  });

  it("UNIQUE 制約を CHECK と読み違えない", () => {
    expect(checks.has("tenants.tenants_slug_key")).toBe(false);
    expect(fks.has("tenants.tenants_slug_key")).toBe(false);
  });

  it("PRIMARY KEY をどちらにも入れない", () => {
    expect(checks.has("tenants.tenants_pkey")).toBe(false);
    expect(fks.has("tenants.tenants_pkey")).toBe(false);
  });

  it("CHECK は2件だけ（件数も固定する）", () => {
    expect([...checks].sort()).toEqual([
      "documents.documents_status_check",
      "tenants.tenants_slug_length",
    ]);
  });
});

/**
 * columnRowsFromDump（列を {name, type} で拾う）のテスト。
 *
 * なぜ要るか: enum 型ドリフト検出（本番 enum ⇄ マイグレーション非 enum）はこの解析に乗る。
 * 型を1トークンで取り、pg_dump の `public.` 修飾を剥がし、GENERATED の折り返し行や制約行を
 * 列と誤認しないことを固定する。本体の check:drift は SUPABASE 秘密が要って手元で回せないので、
 * 解析はここで単体検査する。
 */
const COLDUMP = `
CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_tier text DEFAULT 'free'::text NOT NULL,
    role public.membership_role_enum DEFAULT 'viewer'::public.membership_role_enum,
    "name" character varying(255),
    label_public boolean GENERATED ALWAYS AS (
        CASE WHEN (status = 'active'::text) THEN true
        ELSE false END) STORED,
    CONSTRAINT tenants_plan_check CHECK ((plan_tier <> ''::text))
);
`;

describe("columnRowsFromDump（pg_dump から列と型を拾う）", () => {
  const rows = columnRowsFromDump(COLDUMP);
  const typeOf = (n: string) => rows.find((r) => r.name === n)?.type;

  it("列名を 表名.列名 で拾い、制約行は列にしない", () => {
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual([
      "tenants.id",
      "tenants.label_public",
      "tenants.name",
      "tenants.plan_tier",
      "tenants.role",
    ]);
  });

  it("型は先頭トークン。uuid / text をそのまま拾う", () => {
    expect(typeOf("tenants.id")).toBe("uuid");
    expect(typeOf("tenants.plan_tier")).toBe("text");
  });

  it("public. 修飾の enum は剥がして enum 名だけにする", () => {
    expect(typeOf("tenants.role")).toBe("membership_role_enum");
  });

  it("複合型（character varying）は先頭語になり、どの enum 名とも一致しない", () => {
    expect(typeOf("tenants.name")).toBe("character");
  });

  it("GENERATED の折り返し行（CASE/WHEN/ELSE/END）を列と誤認しない", () => {
    expect(rows.some((r) => /when|else|end|then/i.test(r.name))).toBe(false);
    expect(typeOf("tenants.label_public")).toBe("boolean");
  });
});
