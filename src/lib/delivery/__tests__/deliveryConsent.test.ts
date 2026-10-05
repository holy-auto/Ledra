import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliveryConsentStatus,
  isElectronicDeliveryBlocked,
  electronicDeliveryBlockMessage,
  computeDeliveryConsentTextHash,
  deliveryConsentText,
  DELIVERY_CONSENT_VERSION,
} from "../deliveryConsent";

describe("deliveryConsent [G3/G4 電子交付の承諾]", () => {
  it("行なし=none / granted / revoked を返す", () => {
    expect(deliveryConsentStatus(null)).toBe("none");
    expect(deliveryConsentStatus(undefined)).toBe("none");
    expect(deliveryConsentStatus({ status: "granted" })).toBe("granted");
    expect(deliveryConsentStatus({ status: "revoked" })).toBe("revoked");
  });

  it("ブロックは撤回済みのときだけ（未承諾・承諾済みは通す＝非破壊既定）", () => {
    expect(isElectronicDeliveryBlocked(null)).toBe(false); // none → 通す
    expect(isElectronicDeliveryBlocked({ status: "granted" })).toBe(false);
    expect(isElectronicDeliveryBlocked({ status: "revoked" })).toBe(true); // G4: 撤回は交付不可
  });

  it("requireConsent（テナント opt-in）では未承諾もブロック、承諾済みは通す", () => {
    expect(isElectronicDeliveryBlocked(null, true)).toBe(true);
    expect(isElectronicDeliveryBlocked({ status: "granted" }, true)).toBe(false);
    expect(isElectronicDeliveryBlocked({ status: "revoked" }, true)).toBe(true);
  });

  it("開示文言は交付方法を列挙し、撤回できる旨を含む", () => {
    const t = deliveryConsentText();
    expect(t).toMatch(/電子メール/);
    expect(t).toMatch(/撤回/);
  });

  it("consent_text_hash は安定（同じ文言→同じ SHA-256・64hex）", () => {
    const h1 = computeDeliveryConsentTextHash();
    const h2 = computeDeliveryConsentTextHash();
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(DELIVERY_CONSENT_VERSION).toBe("delivery-consent-v1");
  });
});

type Result = { data: unknown; error: unknown };
/** テーブルごとに maybeSingle の結果を返す最小のクエリビルダ模倣（inspectorQualification.test と同型）。 */
function makeDb(cfg: Record<string, Result>): Pick<SupabaseClient, "from"> {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve(cfg[table] ?? { data: null, error: null }),
      };
      return builder as unknown as ReturnType<SupabaseClient["from"]>;
    },
  } as Pick<SupabaseClient, "from">;
}
const ok = (data: unknown): Result => ({ data, error: null });
const fail: Result = { data: null, error: { message: "boom" } };

describe("electronicDeliveryBlockMessage [G3/G4 交付ゲート]", () => {
  const run = (cfg: Record<string, Result>) => electronicDeliveryBlockMessage(makeDb(cfg), "t1", "c1");

  it("撤回済みはテナント設定に関係なくブロック", async () => {
    expect(await run({ delivery_consents: ok({ status: "revoked" }) })).toMatch(/撤回/);
  });
  it("承諾済みは通す", async () => {
    expect(
      await run({ delivery_consents: ok({ status: "granted" }), tenants: ok({ require_delivery_consent: true }) }),
    ).toBeNull();
  });
  it("未承諾: 既定（フラグ false/未設定）は通す＝非破壊", async () => {
    expect(await run({ delivery_consents: ok(null), tenants: ok({ require_delivery_consent: false }) })).toBeNull();
    expect(await run({ delivery_consents: ok(null), tenants: ok(null) })).toBeNull();
  });
  it("未承諾: フラグ true ならブロック", async () => {
    expect(await run({ delivery_consents: ok(null), tenants: ok({ require_delivery_consent: true }) })).toMatch(
      /承諾を得ていません/,
    );
  });
  it("確認できない（クエリ失敗）は fail-closed でブロック", async () => {
    expect(await run({ delivery_consents: fail })).toMatch(/確認できません/);
    expect(await run({ delivery_consents: ok(null), tenants: fail })).toMatch(/確認できません/);
  });
});
