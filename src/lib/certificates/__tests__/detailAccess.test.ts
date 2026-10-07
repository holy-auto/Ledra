import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  cookies: {} as Record<string, string>,
  session: null as { customer_id: string | null; phone_last4_hash: string | null } | null,
  userId: null as string | null,
  member: false,
  vin: null as string | null,
  optOut: false,
  access: null as { scopeFromIso: string | null; purchasedAtIso: string } | null,
  throwOn: null as string | null,
}));

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (h.throwOn === "cookies") throw new Error("boom");
    return {
      get: (n: string) => (n in h.cookies ? { value: h.cookies[n] } : undefined),
      getAll: () => Object.keys(h.cookies).map((name) => ({ name, value: h.cookies[name] })),
    };
  },
}));
vi.mock("@/lib/customerPortalServer", () => ({ CUSTOMER_COOKIE: "hc_cs", validateSession: async () => h.session }));
vi.mock("@/lib/auth/checkRole", () => ({ resolveUserId: async () => h.userId }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: h.member ? { tenant_id: "t1" } : null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { vin_code_normalized: h.vin, passport_opt_out: h.optOut } }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/passport/featureGate", () => ({ isPassportPublicEnabled: () => true }));
vi.mock("@/lib/vehicleReport/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/vehicleReport/access")>()),
  findValidReportAccess: async (_vin: string, token: string | undefined) => (token ? h.access : null),
}));

import { canViewCertificateDetails, isOwnerSession, redactCertificateDetails } from "../detailAccess";
import { certInReportScope, reportCookieName } from "@/lib/vehicleReport/access";

const cert = {
  tenant_id: "t1",
  vehicle_id: "v1",
  customer_id: "c1",
  customer_phone_last4_hash: "ph1",
  hidden_from_owner_portal_at: null,
  created_at: "2026-06-01T00:00:00Z",
};

beforeEach(() => {
  Object.assign(h, {
    cookies: {},
    session: null,
    userId: null,
    member: false,
    vin: null,
    optOut: false,
    access: null,
    throwOn: null,
  });
});

describe("isOwnerSession [公開証明書の所有者判定]", () => {
  it("customer_id が焼き込まれたセッションは customer_id で照合する（電話ハッシュが合っても別人は不可）", () => {
    expect(isOwnerSession({ customer_id: "c1", phone_last4_hash: null }, cert)).toBe(true);
    expect(isOwnerSession({ customer_id: "c2", phone_last4_hash: "ph1" }, cert)).toBe(false);
  });
  it("customer_id の無い旧セッションは電話下4桁ハッシュで照合する", () => {
    expect(isOwnerSession({ customer_id: null, phone_last4_hash: "ph1" }, cert)).toBe(true);
    expect(
      isOwnerSession({ customer_id: null, phone_last4_hash: null }, { ...cert, customer_phone_last4_hash: null }),
    ).toBe(false);
  });
  it("所有権移転で旧オーナーから隠した証明書は所有者扱いしない", () => {
    expect(
      isOwnerSession(
        { customer_id: "c1", phone_last4_hash: null },
        { ...cert, hidden_from_owner_portal_at: "2026-07-01" },
      ),
    ).toBe(false);
  });
});

describe("canViewCertificateDetails [写真・個人情報を見せる閲覧者]", () => {
  it("匿名は見せない", async () => {
    expect(await canViewCertificateDetails(cert)).toBe(false);
  });
  it("所有者（ポータルにログイン中）は見せる", async () => {
    h.cookies = { hc_cs: "tok" };
    h.session = { customer_id: "c1", phone_last4_hash: null };
    expect(await canViewCertificateDetails(cert)).toBe(true);
  });
  it("発行テナントのスタッフは見せ、他テナントのスタッフ（所属なし）は見せない", async () => {
    h.userId = "u1";
    expect(await canViewCertificateDetails(cert)).toBe(false);
    h.member = true;
    expect(await canViewCertificateDetails(cert)).toBe(true);
  });
  it("履歴レポート購入者は、購入の開示範囲に入る証明書だけ見せる", async () => {
    h.vin = "VIN1";
    h.cookies = { [reportCookieName("VIN1")]: "paid" };
    h.access = { scopeFromIso: null, purchasedAtIso: "2026-07-01T00:00:00Z" };
    expect(await canViewCertificateDetails(cert)).toBe(true);
    h.access = { scopeFromIso: "2026-06-15T00:00:00Z", purchasedAtIso: "2026-07-01T00:00:00Z" };
    expect(await canViewCertificateDetails(cert)).toBe(false);
  });
  it("パスポートを opt-out した車両の証明書は、同じ VIN のレポートを買っても見せない（レポートに載らない）", async () => {
    h.vin = "VIN1";
    h.optOut = true;
    h.cookies = { [reportCookieName("VIN1")]: "paid" };
    h.access = { scopeFromIso: null, purchasedAtIso: "2026-07-01T00:00:00Z" };
    expect(await canViewCertificateDetails(cert)).toBe(false);
  });
  it("テナントが分からない証明書は見せない", async () => {
    h.member = true;
    h.userId = "u1";
    expect(await canViewCertificateDetails({ ...cert, tenant_id: null })).toBe(false);
  });
  it("判定に失敗したら見せない（fail-closed）", async () => {
    h.throwOn = "cookies";
    expect(await canViewCertificateDetails(cert)).toBe(false);
  });
});

describe("certInReportScope", () => {
  const a = { scopeFromIso: "2026-01-01T00:00:00Z", purchasedAtIso: "2026-07-01T00:00:00Z" };
  it("scope_from 〜 購入時点の記録だけ入れる。作成日時不明は入れない", () => {
    expect(certInReportScope(a, "2026-03-01T00:00:00Z")).toBe(true);
    expect(certInReportScope(a, "2025-12-31T00:00:00Z")).toBe(false);
    expect(certInReportScope(a, "2026-07-02T00:00:00Z")).toBe(false);
    expect(certInReportScope(a, null)).toBe(false);
  });
});

describe("redactCertificateDetails [匿名向けに個人情報を落とす]", () => {
  it("担当者名・自由記述・知らないキーを落とし、許可した項目だけ残す", () => {
    const r = redactCertificateDetails({
      craftsman_name: "山田",
      maintenance_json: { work_types: ["oil"], mileage: 1000, mechanic_name: "佐藤", findings: "顧客宅で", extra: 1 },
      body_repair_json: { repair_type: "dent", before_notes: "メモ", warranty_info: "保証" },
      accessory_json: { product_name: "X", installer_name: "鈴木", install_notes: "メモ" },
    });
    expect(r).toEqual({
      craftsman_name: null,
      maintenance_json: { work_types: ["oil"], mileage: 1000 },
      body_repair_json: { repair_type: "dent" },
      accessory_json: { product_name: "X" },
    });
  });
  it("JSON が無い・配列なら null", () => {
    expect(redactCertificateDetails({ maintenance_json: null, body_repair_json: [] }).body_repair_json).toBeNull();
  });
});
