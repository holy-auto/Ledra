import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliveryConsentStatus,
  isElectronicDeliveryBlocked,
  electronicDeliveryBlockMessage,
  customerFacingDeliveryBlock,
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
/**
 * テーブルごとに maybeSingle の結果を返す最小のクエリビルダ模倣。eq の (列, 値) を記録し、
 * 誤った列・テナントで絞った場合にテストで検出できるようにする。
 */
function makeDb(cfg: Record<string, Result>) {
  const calls: Record<string, [string, unknown][]> = {};
  const inserted: Record<string, unknown[]> = {};
  const db = {
    from(table: string) {
      calls[table] = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => (calls[table].push([col, val]), builder),
        maybeSingle: () => Promise.resolve(cfg[table] ?? { data: null, error: null }),
        insert: (row: unknown) => ((inserted[table] ??= []).push(row), Promise.resolve({ error: null })),
      };
      return builder as unknown as ReturnType<SupabaseClient["from"]>;
    },
  } as Pick<SupabaseClient, "from">;
  return { db, calls, inserted };
}
const ok = (data: unknown): Result => ({ data, error: null });
const fail: Result = { data: null, error: { message: "boom" } };
const STRICT = ok({ require_delivery_consent: true });

describe("electronicDeliveryBlockMessage [G3/G4 交付ゲート]", () => {
  const run = (cfg: Record<string, Result>, customerId: string | null = "c1") =>
    electronicDeliveryBlockMessage(makeDb(cfg).db, "t1", customerId);

  it("撤回済みはテナント設定に関係なくブロック", async () => {
    expect(await run({ delivery_consents: ok({ status: "revoked" }) })).toMatch(/撤回/);
  });
  it("承諾済みは通す", async () => {
    expect(await run({ delivery_consents: ok({ status: "granted" }), tenants: STRICT })).toBeNull();
  });
  it("未承諾: 既定（フラグ false/未設定）は通す＝非破壊", async () => {
    expect(await run({ delivery_consents: ok(null), tenants: ok({ require_delivery_consent: false }) })).toBeNull();
    expect(await run({ delivery_consents: ok(null), tenants: ok(null) })).toBeNull();
  });
  it("未承諾: フラグ true ならブロック", async () => {
    expect(await run({ delivery_consents: ok(null), tenants: STRICT })).toMatch(/承諾を得ていません/);
  });
  it("顧客未紐付け: 既定は通し、フラグ true ならブロック", async () => {
    expect(await run({ tenants: ok({ require_delivery_consent: false }) }, null)).toBeNull();
    expect(await run({ tenants: STRICT }, null)).toMatch(/顧客が紐付いていない/);
  });
  it("承諾クエリ失敗は fail-closed、テナント設定の読み取り失敗は既定（通す）", async () => {
    expect(await run({ delivery_consents: fail })).toMatch(/確認できません/);
    expect(await run({ delivery_consents: ok(null), tenants: fail })).toBeNull();
  });
  it("自テナント・対象顧客で絞り込む", async () => {
    const { db, calls } = makeDb({ delivery_consents: ok(null), tenants: STRICT });
    await electronicDeliveryBlockMessage(db, "t1", "c1");
    expect(calls.delivery_consents).toEqual([
      ["tenant_id", "t1"],
      ["customer_id", "c1"],
    ]);
    expect(calls.tenants).toEqual([["id", "t1"]]);
  });
});

describe("customerFacingDeliveryBlock [発行済みの署名/受領リンク]", () => {
  const CERT = ok({ tenant_id: "t1", customer_id: "c1" });
  const CTX = { sessionId: "s1" };

  it("証明書に紐付かないセッションは対象外（DB を読まない）", async () => {
    const { db, calls } = makeDb({});
    expect(await customerFacingDeliveryBlock(db, null, CTX)).toBeNull();
    expect(calls).toEqual({});
  });
  it("撤回済みなら 409。お客様向けの文面で、店舗向けの理由（撤回の有無）は出さない", async () => {
    const { db, inserted } = makeDb({ certificates: CERT, delivery_consents: ok({ status: "revoked" }) });
    const r = await customerFacingDeliveryBlock(db, "cert1", CTX);
    expect(r?.status).toBe(409);
    expect(r?.message).not.toMatch(/撤回/);
    // 止めたことを G4 の証跡として audit_logs に残す
    await Promise.resolve();
    expect(inserted.audit_logs).toEqual([
      expect.objectContaining({ tenant_id: "t1", action: "delivery_link_blocked" }),
    ]);
  });
  it("承諾済みなら通す・その証明書の顧客で判定する", async () => {
    const { db, calls } = makeDb({ certificates: CERT, delivery_consents: ok({ status: "granted" }) });
    expect(await customerFacingDeliveryBlock(db, "cert1", CTX)).toBeNull();
    expect(calls.certificates).toEqual([["id", "cert1"]]);
    expect(calls.delivery_consents).toEqual([
      ["tenant_id", "t1"],
      ["customer_id", "c1"],
    ]);
  });
  it("証明書・承諾状態を読めないときは 503（承諾の問題とは言わない）", async () => {
    expect((await customerFacingDeliveryBlock(makeDb({ certificates: fail }).db, "cert1", CTX))?.status).toBe(503);
    expect(
      (await customerFacingDeliveryBlock(makeDb({ certificates: CERT, delivery_consents: fail }).db, "cert1", CTX))
        ?.status,
    ).toBe(503);
  });
});
