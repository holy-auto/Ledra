/**
 * getSquareContext のロケーション解決の検証。
 *
 * Ledra は店舗ごとの Square ロケーション選択を持たない。1つに決まらないのに
 * 先頭を黙って使うと、端末のペアリングも引き当ての検索も別店舗に向く。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/crypto/tenantSecrets", () => ({
  readSecret: async (v: string | null) => v,
  buildSecretWrite: async (v: string) => ({ ciphertext: `enc:${v}` }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { getSquareContext, SquareNotConnectedError } from "@/lib/square/client";

function fakeAdmin(conn: Record<string, unknown> | null) {
  const node = {
    select: () => node,
    eq: () => node,
    maybeSingle: async () => ({ data: conn, error: null }),
  };
  return { from: () => node } as never;
}

const baseConn = {
  id: "conn-1",
  status: "active",
  square_access_token_ciphertext: "tok",
  square_refresh_token_ciphertext: "refresh",
  square_token_expires_at: null,
  square_terminal_device_id: "D1",
};

describe("getSquareContext", () => {
  it("ロケーションが1つなら普通に返す", async () => {
    const ctx = await getSquareContext(fakeAdmin({ ...baseConn, square_location_ids: ["L1"] }), "t1");
    expect(ctx.locationId).toBe("L1");
  });

  it("ロケーションが複数あるときは先頭を黙って使わず例外にする", async () => {
    await expect(getSquareContext(fakeAdmin({ ...baseConn, square_location_ids: ["L1", "L2"] }), "t1")).rejects.toThrow(
      SquareNotConnectedError,
    );
  });

  it("ロケーションが0件でも（端末未接続の店として）例外にしない", async () => {
    const ctx = await getSquareContext(fakeAdmin({ ...baseConn, square_location_ids: [] }), "t1");
    expect(ctx.locationId).toBeNull();
  });
});
