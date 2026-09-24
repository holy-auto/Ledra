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
import { uniqueFromDump, constraintsFromDump } from "../lib/dumpParse.mjs";

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
