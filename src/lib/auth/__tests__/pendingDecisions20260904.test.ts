/**
 * 2026-09-04 の代表判断4件を固定する。
 *
 * どれも「事業判断」であって実装の都合ではないので、勝手に緩めないよう
 * 表の値そのものを検査する。変えるときは DECISION_LOG に新しい判断を書くこと。
 *
 * DB 側（tenants の UPDATE を owner のみに、共有テンプレートをプラットフォーム限定に）は
 * supabase/migrations/20260904123252_*.sql が担う（本番適用済み）。ここでは API 側だけを見る。
 */
import { describe, it, expect } from "vitest";
import { API_ROUTE_PERMISSIONS, hasPermission, type Permission } from "@/lib/auth/permissions";

describe("2026-09-04 代表判断", () => {
  it("テナント設定は owner のみ（admin では通らない）", () => {
    // settings:edit は admin も持つので、権限ではなくロール下限で絞る必要がある。
    expect(hasPermission("admin", "settings:edit")).toBe(true);
    expect(API_ROUTE_PERMISSIONS["admin/settings/defaults"]).toEqual({ minRole: "owner" });
  });

  it("顧客とマーケット車両の削除は admin 以上（作成・編集は staff のまま）", () => {
    // 削除は不可逆。顧客には施工履歴・証明書がぶら下がる。
    // ロール下限ではなく専用の動詞にしてある（この表の原則。vehicles:delete が先例）。
    for (const [route, del] of [
      ["admin/customers", "customers:delete"],
      ["admin/market-vehicles", "market:delete"],
    ] as const) {
      const entry = API_ROUTE_PERMISSIONS[route] as Record<string, Permission>;
      expect(entry, `${route} が表に無い`).toBeDefined();
      expect(entry.DELETE).toBe(del);

      // 削除は admin 以上で staff は不可。
      expect(hasPermission("admin", del)).toBe(true);
      expect(hasPermission("owner", del)).toBe(true);
      expect(hasPermission("staff", del)).toBe(false);
      expect(hasPermission("viewer", del)).toBe(false);

      // 作成・編集は staff のまま（現場の通常業務を止めない）。
      // 「文字列であること」だけを見ると、owner 専用の権限に差し替えられても
      // 緑のままになる。**staff が実際に通ること**を見る。
      expect(hasPermission("staff", entry.POST)).toBe(true);
      expect(hasPermission("staff", entry.PUT)).toBe(true);
    }
  });

  it("staff は settings:edit を持たない（テナント設定の前提）", () => {
    expect(hasPermission("staff", "settings:edit")).toBe(false);
  });
});
