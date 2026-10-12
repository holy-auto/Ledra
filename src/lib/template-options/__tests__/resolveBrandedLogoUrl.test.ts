/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  signed: [] as string[],
  filters: [] as Array<[string, unknown]>,
  row: null as { storage_path: string } | null,
  failPaths: [] as string[],
}));

vi.mock("@/lib/signedUrl", () => ({
  createSignedAssetUrl: async (p: string) => {
    h.signed.push(p);
    return h.failPaths.includes(p) ? null : `https://s/${p}?token=x`;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceRoleAdmin: () => ({
    from: () => {
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          h.filters.push([k, v]);
          return q;
        },
        maybeSingle: async () => ({ data: h.row, error: null }),
      };
      return q;
    },
  }),
}));

import { resolveBrandedLogoUrl } from "../renderBrandedCertificate";

const config = (logo_asset_id?: string) => ({ branding: { logo_asset_id } }) as any;

beforeEach(() => {
  h.signed = [];
  h.filters = [];
  h.row = null;
  h.failPaths = [];
});

describe("resolveBrandedLogoUrl [ブランド証明書のロゴ]", () => {
  it("テンプレートのロゴは template_assets の保存パスを、そのテナントのロゴに限って署名する", async () => {
    h.row = { storage_path: "template-logos/t1/1700000000000.png" };
    const url = await resolveBrandedLogoUrl(config("a1"), { logo_asset_path: "tenants/t1/logo.png" }, "t1");
    expect(h.signed).toEqual(["template-logos/t1/1700000000000.png"]);
    expect(url).toContain("template-logos/t1/");
    expect(h.filters).toEqual(
      expect.arrayContaining([
        ["id", "a1"],
        ["tenant_id", "t1"],
        ["asset_type", "logo"],
      ]),
    );
  });

  it("他テナントのロゴ ID（行が引けない）なら、証明書側のロゴに落とす", async () => {
    await resolveBrandedLogoUrl(config("other"), { logo_asset_path: "tenants/t1/logo.png" }, "t1");
    expect(h.signed).toEqual(["tenants/t1/logo.png"]);
  });

  it("テナントが無い呼び出し（メーカー指定デザイン）でロゴ ID があれば、施工店のロゴも差し込まない", async () => {
    h.row = { storage_path: "template-logos/x/1.png" };
    const url = await resolveBrandedLogoUrl(config("a1"), { logo_asset_path: "tenants/t1/logo.png" }, null);
    expect(url).toBeNull();
    expect(h.filters).toEqual([]);
    expect(h.signed).toEqual([]);
  });

  it("テンプレートのロゴが署名できなければ、証明書側のロゴに落とす", async () => {
    h.row = { storage_path: "template-logos/t1/gone.png" };
    h.failPaths = ["template-logos/t1/gone.png"];
    const url = await resolveBrandedLogoUrl(config("a1"), { logo_asset_path: "tenants/t1/logo.png" }, "t1");
    expect(url).toBe("https://s/tenants/t1/logo.png?token=x");
  });
});
