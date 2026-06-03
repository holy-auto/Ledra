/**
 * Static migration audit — 部品装着インテグリティ Phase 1。
 *
 * DB を立てない単体テストでは「マイグレーション SQL が設計どおりの保護を
 * 宣言しているか」を静的に検証する（既存 posReceiptCounter.test.ts と同方針）。
 * 実際のトリガ挙動は Supabase ブランチでの手動/結合テストで確認する。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIG = join(__dirname, "..", "migrations");
const core = readFileSync(join(MIG, "20260603000000_part_installations.sql"), "utf-8");
const guard = readFileSync(join(MIG, "20260603000001_part_installations_guard.sql"), "utf-8");

/** `-- コメント` を除去して、ドキュメント文に対する誤検知を防ぐ。 */
const strip = (s: string) => s.replace(/--[^\n]*\n/g, "\n");
const coreSql = strip(core);
const guardSql = strip(guard);

describe("core migration: テーブルと RLS", () => {
  for (const t of [
    "part_installations",
    "part_confirmation_signatures",
    "part_serial_registry",
    "part_integrity_findings",
    "part_installation_evidence",
  ]) {
    it(`${t} を作成し RLS を有効化`, () => {
      expect(coreSql).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
      // 当該テーブルに対する ENABLE ROW LEVEL SECURITY（列整形の空白は許容）
      expect(coreSql).toMatch(new RegExp(`ALTER TABLE ${t}\\s+ENABLE ROW LEVEL SECURITY`));
    });
  }

  it("全テーブルで ENABLE ROW LEVEL SECURITY", () => {
    const count = (coreSql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("追記専用テーブルには UPDATE/DELETE ポリシーを置かない", () => {
    expect(coreSql).not.toMatch(/CREATE POLICY[^\n]*part_installation_evidence[^\n]*FOR UPDATE/i);
    expect(coreSql).not.toMatch(/CREATE POLICY[^\n]*part_serial_registry[^\n]*FOR (UPDATE|DELETE)/i);
  });

  it("既存テーブルへの列追加は NOT NULL を default 付きでのみ行う（テーブル書き換え回避）", () => {
    // inventory_items.default_serial_tracked は NOT NULL DEFAULT false
    expect(coreSql).toMatch(/default_serial_tracked boolean NOT NULL DEFAULT false/);
    // customers の追加列は nullable
    expect(coreSql).toMatch(/ADD COLUMN IF NOT EXISTS phone_full_hash\s+text/);
  });

  it("後付け FK は NOT VALID（lint 規約）", () => {
    expect(coreSql).toMatch(/ADD CONSTRAINT part_installations_confirmation_signature_fk[\s\S]*NOT VALID/);
  });
});

describe("guard migration: 完全凍結とパターン", () => {
  it("ガード関数はすべて SECURITY DEFINER + search_path 空", () => {
    const definers = (guardSql.match(/SECURITY DEFINER/g) ?? []).length;
    const searchPaths = (guardSql.match(/SET search_path = ''/g) ?? []).length;
    expect(definers).toBeGreaterThanOrEqual(4);
    expect(searchPaths).toBeGreaterThanOrEqual(4);
  });

  it("確定済みは voided 遷移のみ許可・他は RAISE EXCEPTION", () => {
    expect(guardSql).toContain("part_installations_guard");
    expect(guardSql).toMatch(/OLD\.status = 'customer_verified'/);
    expect(guardSql).toMatch(/NEW\.status = 'voided'/);
    expect(guardSql).toMatch(/NEW\.void_reason IS NOT NULL/);
    expect(guardSql).toMatch(/確定済みレコードは変更できません/);
  });

  it("content_hash は確定後に据え置き必須", () => {
    expect(guardSql).toMatch(/NEW\.content_hash\s+IS NOT DISTINCT FROM OLD\.content_hash/);
  });

  it("確定ゲートは署名済み・document_hash 一致・電話フル番号一致・保証グレードを要求", () => {
    expect(guardSql).toMatch(/s\.status = 'signed'/);
    expect(guardSql).toMatch(/s\.document_hash = NEW\.content_hash/);
    expect(guardSql).toMatch(/s\.signer_phone_full_hash = c\.phone_full_hash/);
    expect(guardSql).toMatch(/part_meets_required_assurance/);
  });

  it("evidence と serial_registry は UPDATE/DELETE を常時拒否", () => {
    expect(guardSql).toMatch(/part_evidence_append_only[\s\S]*BEFORE UPDATE OR DELETE ON part_installation_evidence/);
    expect(guardSql).toMatch(/part_serial_registry_append_only[\s\S]*BEFORE UPDATE OR DELETE ON part_serial_registry/);
  });

  it("シリアル登録関数は public から実行権を剥奪している", () => {
    expect(guardSql).toMatch(/REVOKE ALL ON FUNCTION public\.part_register_serial/);
  });
});
