/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  dup: null as unknown,
  inspect: vi.fn(),
  remove: vi.fn(async () => ({ error: null })),
  inserted: [] as unknown[],
}));

vi.mock("@/lib/api/withCaller", () => ({
  withCaller: (handler: any) => (req: unknown) => handler(req, { caller: { tenantId: "t1" }, params: { id: "PID" } }),
}));
vi.mock("@/lib/certificates/gateReadyNotify", () => ({ watchGateReadyTransition: vi.fn() }));
vi.mock("@/lib/certificateMedia/inspectStoredVideo", () => ({ inspectStoredVideo: h.inspect }));
vi.mock("@/lib/supabase/admin", () => ({
  createTenantScopedAdmin: () => ({
    admin: {
      from: (table: string) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          maybeSingle: async () => ({
            data:
              table === "certificates"
                ? { id: "c1", tenant_id: "t1", status: "draft" }
                : table === "certificate_media"
                  ? h.dup
                  : null,
            error: null,
          }),
          insert: (row: unknown) => {
            h.inserted.push(row);
            return { select: () => ({ single: async () => ({ data: { id: "m1" }, error: null }) }) };
          },
        };
        return q;
      },
      storage: { from: () => ({ remove: h.remove, upload: vi.fn(async () => ({ error: null })) }) },
    },
  }),
}));

import { POST } from "../route";

const OWN = "media/t1/c1/1700000000000_main.mp4";
function post(primaryPath: string) {
  const form = new FormData();
  form.append("media_type", "video");
  form.append("primary_path", primaryPath);
  return (POST as any)(new Request("http://x/api/certificates/PID/media", { method: "POST", body: form }));
}

beforeEach(() => {
  h.dup = null;
  h.inspect.mockReset();
  h.remove.mockClear();
  h.inserted = [];
});

describe("POST /api/certificates/[id]/media [直接アップロードした動画の登録]", () => {
  it("自分の証明書の保存パスで実物が正しければ、送り直さずにそのパスで登録する", async () => {
    h.inspect.mockResolvedValue({ ok: true, data: { mime: "video/mp4", ext: "mp4", size: 30_000_000 } });
    const res = await post(OWN);
    expect(res.status).toBe(200);
    expect(h.inserted[0]).toMatchObject({ storage_path: OWN, content_type: "video/mp4", file_size: 30_000_000 });
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("他テナント・他の証明書の保存パスは登録しない（実物も見ない・消さない）", async () => {
    const res = await post("media/t2/c1/1700000000000_main.mp4");
    expect(res.status).toBe(400);
    expect(h.inspect).not.toHaveBeenCalled();
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("登録済みの動画のパスを渡されたら、重複登録せず、元の動画も消さない", async () => {
    h.dup = { id: "existing" };
    const res = await post(OWN);
    expect(res.status).toBe(409);
    expect(h.inserted).toEqual([]);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it("中身が不正と確定したら置かれたファイルを消し、一時的に読めないだけなら消さずに 503", async () => {
    h.inspect.mockResolvedValueOnce({ ok: false, error: "bad", definitive: true });
    expect((await post(OWN)).status).toBe(400);
    expect(h.remove).toHaveBeenCalledWith([OWN]);

    h.remove.mockClear();
    h.inspect.mockResolvedValueOnce({ ok: false, error: "later", definitive: false });
    expect((await post(OWN)).status).toBe(503);
    expect(h.remove).not.toHaveBeenCalled();
  });
});
