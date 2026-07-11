/**
 * 発行者の本人性保証 (roadmap 4-14 の発行時ステップアップ記録) の単体テスト。
 *   - describeAssurance: 保証レベル → 監査ラベルの写像
 *   - getActorAssurance: Supabase MFA の AAL/認証方式から保証を導く
 *     (パスキー使用の検出、未対応バージョンや失敗時のフォールバック)
 */
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeAssurance } from "../issuerAssurance";
import { getActorAssurance } from "@/lib/auth/mfa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(aalResult: unknown, opts?: { noMfa?: boolean; throws?: boolean }): SupabaseClient<any, any, any> {
  const mfa = opts?.noMfa
    ? undefined
    : {
        getAuthenticatorAssuranceLevel: opts?.throws
          ? () => {
              throw new Error("boom");
            }
          : () => Promise.resolve(aalResult),
      };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { auth: { mfa } } as any;
}

describe("describeAssurance", () => {
  it("パスキー使用が最優先で示される", () => {
    expect(describeAssurance({ aal: "aal2", usedWebAuthn: true })).toContain("パスキー");
  });
  it("パスキー無しの aal2 は2段階認証", () => {
    expect(describeAssurance({ aal: "aal2", usedWebAuthn: false })).toContain("2段階認証");
  });
  it("aal1 はパスワードのみ", () => {
    expect(describeAssurance({ aal: "aal1", usedWebAuthn: false })).toContain("パスワードのみ");
  });
  it("不明は不明ラベル", () => {
    expect(describeAssurance({ aal: null, usedWebAuthn: false })).toBe("不明");
  });
});

describe("getActorAssurance", () => {
  it("認証方式に webauthn を含めば usedWebAuthn=true / aal2", async () => {
    const supabase = fakeSupabase({
      data: {
        currentLevel: "aal2",
        currentAuthenticationMethods: [{ method: "password" }, { method: "mfa/webauthn" }],
      },
    });
    expect(await getActorAssurance(supabase)).toEqual({ aal: "aal2", usedWebAuthn: true });
  });

  it("TOTP のみの aal2 は usedWebAuthn=false", async () => {
    const supabase = fakeSupabase({
      data: { currentLevel: "aal2", currentAuthenticationMethods: [{ method: "mfa/totp" }] },
    });
    expect(await getActorAssurance(supabase)).toEqual({ aal: "aal2", usedWebAuthn: false });
  });

  it("aal1 (パスワードのみ) は aal1 / usedWebAuthn=false", async () => {
    const supabase = fakeSupabase({
      data: { currentLevel: "aal1", currentAuthenticationMethods: [{ method: "password" }] },
    });
    expect(await getActorAssurance(supabase)).toEqual({ aal: "aal1", usedWebAuthn: false });
  });

  it("MFA API 未対応バージョンは null/false にフォールバック", async () => {
    expect(await getActorAssurance(fakeSupabase(null, { noMfa: true }))).toEqual({ aal: null, usedWebAuthn: false });
  });

  it("取得が例外を投げても発行をブロックせずフォールバック", async () => {
    expect(await getActorAssurance(fakeSupabase(null, { throws: true }))).toEqual({
      aal: null,
      usedWebAuthn: false,
    });
  });
});
