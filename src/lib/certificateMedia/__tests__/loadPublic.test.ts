/**
 * loadPublicCertificateMedia のテスト。
 *
 * B-M2 是正の回帰確認: `active` 以外の状態（draft / expired 等）ではメディアの
 * 署名 URL を返さない。以前は `void` 以外なら全て返していた。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const h: any = { certStatus: "active" as string | null, certId: "cert-1" };

  h.makeAdmin = () => ({
    from: (table: string) => {
      if (table === "certificates") {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: h.certId ? { id: h.certId, status: h.certStatus } : null }),
              }),
            }),
          }),
        };
      }
      if (table === "certificate_media") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  returns: () => ({
                    // resolved as a thenable-ish chain terminator
                    then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  });

  return h;
});

vi.mock("@/lib/supabase/admin", () => ({ createServiceRoleAdmin: () => h.makeAdmin() }));

import { loadPublicCertificateMedia } from "../loadPublic";

beforeEach(() => {
  h.certStatus = "active";
  h.certId = "cert-1";
});

describe("loadPublicCertificateMedia", () => {
  it("active な証明書はメディア取得を試みる (空配列でもエラーにならない)", async () => {
    const res = await loadPublicCertificateMedia("pub-1");
    expect(res).toEqual([]);
  });

  it("draft の証明書は空配列を返す (B-M2 回帰確認)", async () => {
    h.certStatus = "draft";
    const res = await loadPublicCertificateMedia("pub-1");
    expect(res).toEqual([]);
  });

  it("expired の証明書は空配列を返す (B-M2 回帰確認)", async () => {
    h.certStatus = "expired";
    const res = await loadPublicCertificateMedia("pub-1");
    expect(res).toEqual([]);
  });

  it("void の証明書は空配列を返す", async () => {
    h.certStatus = "void";
    const res = await loadPublicCertificateMedia("pub-1");
    expect(res).toEqual([]);
  });

  it("証明書が存在しなければ空配列を返す", async () => {
    h.certId = "";
    const res = await loadPublicCertificateMedia("pub-1");
    expect(res).toEqual([]);
  });
});
