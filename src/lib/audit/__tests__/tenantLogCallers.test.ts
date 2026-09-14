/**
 * G-M8 回帰確認 (2026-09-08)。
 *
 * 本番の audit_logs は RLS 有効・policy 0本（Supabase advisor で実測確認済み）。
 * 利用者スコープの Supabase クライアント（RLS が効く）で logTenantAuditEvent を
 * 呼ぶと insert が黙って弾かれ、監査ログが1件も残らない
 * （supabase-js の insert はエラーを投げず戻り値に入れるだけで、以前は
 * 6箇所すべてがこの戻り値を見ていなかった）。
 *
 * caller.supabase（モバイル側の利用者スコープクライアント）を直接渡す呼び出しが
 * 復活していないかを、ソースを読んで機械的に検出する。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walkSource } from "@/lib/__tests__/sourceScan";

const API_ROOT = join(process.cwd(), "src", "app", "api");

describe("logTenantAuditEvent は利用者スコープのクライアントを直接渡さない", () => {
  it("caller.supabase / 生の supabase を第一引数に渡す呼び出しが無い", () => {
    const files = walkSource(API_ROOT);
    const offenders: string[] = [];
    // RLS を bypass しない、利用者スコープのクライアントをそのまま渡している形。
    // admin ラップ（createTenantScopedAdmin 等が返す admin 変数）だけを許可する。
    const bad = /logTenantAuditEvent\(\s*(caller\.supabase|supabase)\s*,/;

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("logTenantAuditEvent(")) continue;
      if (bad.test(src)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
