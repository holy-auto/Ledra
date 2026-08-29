/**
 * Static migration audit — 証明書写真 証跡凍結ガード (IMP-023 §7)。
 *
 * DB を立てない単体テストでは「マイグレーション SQL が設計どおりの保護を
 * 宣言しているか」を静的に検証する（既存 partInstallations.test.ts と同方針）。
 * 実際のトリガ挙動は Supabase ブランチでの手動/結合テストで確認する。
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIG = join(__dirname, "..", "migrations");
const guard = readFileSync(join(MIG, "20260820000000_certificate_images_guard.sql"), "utf-8");

/** `-- コメント` を除去して、ドキュメント文に対する誤検知を防ぐ。 */
const strip = (s: string) => s.replace(/--[^\n]*\n/g, "\n");
const guardSql = strip(guard);

describe("certificate_images_guard migration", () => {
  it("SECURITY DEFINER + search_path 空", () => {
    expect(guardSql).toMatch(/CREATE OR REPLACE FUNCTION public\.certificate_images_guard[\s\S]*SECURITY DEFINER/);
    expect(guardSql).toMatch(/SET search_path = ''/);
  });

  it("draft のみ制限なし — active/void/expired はすべて保護対象", () => {
    // 制限なしの分岐は draft のみを見ている（expired を巻き込んでいない）
    expect(guardSql).toMatch(/v_cert_status\s*=\s*'draft'/);
    expect(guardSql).not.toMatch(/NOT IN \('active',\s*'void'\)/);
  });

  it("DELETE は draft 以外の親を持つ行を拒否", () => {
    expect(guardSql).toMatch(/TG_OP = 'DELETE'[\s\S]*RAISE EXCEPTION/);
  });

  it("証跡列10種+certificate_id の変更を拒否", () => {
    for (const col of [
      "sha256",
      "original_sha256",
      "perceptual_hash",
      "stage",
      "authenticity_grade",
      "tsa_token",
      "tsa_authority",
      "tsa_timestamp_at",
      "c2pa_manifest_cid",
      "storage_path",
      "certificate_id",
    ]) {
      expect(guardSql).toMatch(new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`));
    }
  });

  it("トリガーは BEFORE UPDATE OR DELETE で1本のみ", () => {
    const triggers = guardSql.match(/CREATE TRIGGER/g) ?? [];
    expect(triggers).toHaveLength(1);
    expect(guardSql).toMatch(/BEFORE UPDATE OR DELETE ON certificate_images/);
  });
});
