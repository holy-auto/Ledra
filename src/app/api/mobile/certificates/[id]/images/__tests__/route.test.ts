/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveMobileCaller: vi.fn(),
  createSignedUrls: vi.fn(),
}));

vi.mock("@/lib/auth/mobileAuth", () => ({ resolveMobileCaller: mocks.resolveMobileCaller }));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: { storage: { from: () => ({ createSignedUrls: mocks.createSignedUrls }) } },
  }),
}));

import { GET } from "../route";

const TENANT = "11111111-1111-1111-1111-111111111111";
const CERT_ID = "22222222-2222-42d2-a222-222222222222";

/** `.from(t).select().eq()...` の最小の代役。certificates は maybeSingle、certificate_images は order で返す。 */
function callerSupabase(certRow: unknown, images: unknown[], certError: unknown = null) {
  return {
    from: (t: string) => {
      const b: any = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: certRow, error: certError }),
        order: async () => ({ data: t === "certificate_images" ? images : [], error: null }),
      };
      return b;
    },
  };
}

const req = (qs = "") => new Request(`http://x/api/mobile/certificates/${CERT_ID}/images${qs}`) as any;
const params = Promise.resolve({ id: CERT_ID });

beforeEach(() => {
  mocks.resolveMobileCaller.mockReset();
  mocks.createSignedUrls.mockReset();
});

describe("GET /api/mobile/certificates/[id]/images [写真の署名 URL]", () => {
  it("未認証は 401、署名しない", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce(null);
    expect((await GET(req(), { params })).status).toBe(401);
    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });

  it("自テナントに無い証明書は 404、署名しない", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({ tenantId: TENANT, supabase: callerSupabase(null, []) });
    expect((await GET(req(), { params })).status).toBe(404);
    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });

  it("署名 URL を返し、サムネイル・中サイズが無ければ原本で埋める。公開 URL は使わない", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      supabase: callerSupabase({ id: CERT_ID }, [
        {
          id: "i1",
          storage_path: "a/1.jpg",
          thumbnail_path: "a/1_t.webp",
          medium_path: null,
          stage: "after",
          authenticity_grade: "basic",
        },
      ]),
    });
    mocks.createSignedUrls.mockResolvedValueOnce({
      data: [
        { path: "a/1.jpg", signedUrl: "https://s/1?token=x" },
        { path: "a/1_t.webp", signedUrl: "https://s/1t?token=y" },
      ],
      error: null,
    });
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(["a/1.jpg", "a/1_t.webp"], 3600);
    const body = await res.json();
    expect(body.images).toEqual([
      {
        id: "i1",
        stage: "after",
        authenticity_grade: "basic",
        url: "https://s/1?token=x",
        thumbnail_url: "https://s/1t?token=y",
        medium_url: "https://s/1?token=x",
        ext: "jpg",
      },
    ]);
  });

  it("署名に失敗したら URL 無し（null）で返す（落とさない）", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      supabase: callerSupabase({ id: CERT_ID }, [
        {
          id: "i1",
          storage_path: "a/1.jpg",
          thumbnail_path: null,
          medium_path: null,
          stage: null,
          authenticity_grade: null,
        },
      ]),
    });
    mocks.createSignedUrls.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const body = await (await GET(req(), { params })).json();
    expect(body.images[0]).toMatchObject({ url: null, thumbnail_url: null, medium_url: null });
  });

  it("証明書の読み取りが失敗したら 404 ではなく 500（一時障害を「無い」と言わない）", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      supabase: callerSupabase(null, [], { message: "db down" }),
    });
    expect((await GET(req(), { params })).status).toBe(500);
    expect(mocks.createSignedUrls).not.toHaveBeenCalled();
  });

  it("?variant=thumbnail はサムネイル（無ければ原本）だけ署名する", async () => {
    mocks.resolveMobileCaller.mockResolvedValueOnce({
      tenantId: TENANT,
      supabase: callerSupabase({ id: CERT_ID }, [
        { id: "i1", storage_path: "a/1.jpg", thumbnail_path: "a/1_t.webp", medium_path: "a/1_m.webp" },
        { id: "i2", storage_path: "a/2.jpg", thumbnail_path: null, medium_path: null },
      ]),
    });
    mocks.createSignedUrls.mockResolvedValueOnce({ data: [], error: null });
    await GET(req("?variant=thumbnail"), { params });
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(["a/1_t.webp", "a/2.jpg"], 3600);
  });
});
