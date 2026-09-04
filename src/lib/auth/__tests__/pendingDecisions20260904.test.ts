/**
 * 2026-09-04 の代表判断4件を固定する。
 *
 * どれも「事業判断」であって実装の都合ではないので、勝手に緩めないよう
 * 表の値そのものを検査する。変えるときは DECISION_LOG に新しい判断を書くこと。
 *
 * DB 側（tenants の UPDATE を owner のみに、共有テンプレートをプラットフォーム限定に）は
 * supabase/migrations/20260904000000_*.sql が担う。ここでは API 側だけを見る。
 */
import { describe, it, expect } from "vitest";
import { API_ROUTE_PERMISSIONS, hasPermission } from "@/lib/auth/permissions";

describe("2026-09-04 代表判断", () => {
  it("テナント設定は owner のみ（admin では通らない）", () => {
    // settings:edit は admin も持つので、権限ではなくロール下限で絞る必要がある。
    expect(hasPermission("admin", "settings:edit")).toBe(true);
    expect(API_ROUTE_PERMISSIONS["admin/settings/defaults"]).toEqual({ minRole: "owner" });
  });

  it("顧客とマーケット車両の削除は admin 以上（作成・編集は staff のまま）", () => {
    // 削除は不可逆。顧客には施工履歴・証明書がぶら下がる。
    for (const route of ["admin/customers", "admin/market-vehicles"] as const) {
      const entry = API_ROUTE_PERMISSIONS[route];
      expect(entry, `${route} が表に無い`).toBeDefined();
      expect(entry).toMatchObject({ DELETE: { minRole: "admin" } });
      // 作成・編集まで admin に上げていないこと（現場の通常業務を止めない）。
      const perMethod = entry as Record<string, unknown>;
      expect(typeof perMethod.POST).toBe("string");
      expect(typeof perMethod.PUT).toBe("string");
    }
  });

  it("staff は settings:edit を持たない（テナント設定の前提）", () => {
    expect(hasPermission("staff", "settings:edit")).toBe(false);
  });
});
