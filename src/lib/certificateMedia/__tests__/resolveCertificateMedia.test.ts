import { describe, it, expect, vi } from "vitest";
import { resolveCertificateMedia, type CertificateMediaRow } from "@/lib/certificateMedia";

function makeClient(behaviour: (path: string) => { signedUrl: string } | null) {
  const createSignedUrl = vi.fn(async (path: string) => {
    const result = behaviour(path);
    if (!result) return { data: null, error: { message: "not found" } };
    return { data: result, error: null };
  });
  return {
    storage: {
      from: vi.fn(() => ({ createSignedUrl })),
    },
    _spy: createSignedUrl,
  };
}

const baseRow: CertificateMediaRow = {
  id: "11111111-1111-1111-1111-111111111111",
  media_type: "before_after",
  storage_path: "media/t1/c1/123_main.jpg",
  before_path: "media/t1/c1/123_before.jpg",
  poster_path: null,
  duration_ms: null,
  width: null,
  height: null,
  caption: "後／前",
  sort_order: 0,
  content_type: "image/jpeg",
  file_size: 1024,
  created_at: "2026-05-09T00:00:00.000Z",
  diff_summary: null,
  diff_summary_generated_at: null,
};

describe("resolveCertificateMedia", () => {
  it("signs primary, before, and poster paths when present", async () => {
    const client = makeClient((path) => ({ signedUrl: `https://signed/${path}?token=x` }));
    const row: CertificateMediaRow = {
      ...baseRow,
      media_type: "video",
      storage_path: "media/t1/c1/v.mp4",
      before_path: null,
      poster_path: "media/t1/c1/p.jpg",
    };
    const resolved = await resolveCertificateMedia(client, row, 60);
    expect(resolved.url).toBe("https://signed/media/t1/c1/v.mp4?token=x");
    expect(resolved.poster_url).toBe("https://signed/media/t1/c1/p.jpg?token=x");
    expect(resolved.before_url).toBeNull();
    expect(client._spy).toHaveBeenCalledTimes(2);
    expect(client._spy).toHaveBeenCalledWith("media/t1/c1/v.mp4", 60);
    expect(client._spy).toHaveBeenCalledWith("media/t1/c1/p.jpg", 60);
  });

  it("returns null URL when storage signing errors out", async () => {
    const client = makeClient(() => null);
    const resolved = await resolveCertificateMedia(client, baseRow, 60);
    expect(resolved.url).toBeNull();
    expect(resolved.before_url).toBeNull();
  });

  it("never throws when client.storage.from throws synchronously", async () => {
    const client = {
      storage: {
        from: () => {
          throw new Error("storage offline");
        },
      },
    } as unknown as Parameters<typeof resolveCertificateMedia>[0];
    const resolved = await resolveCertificateMedia(client, baseRow, 60);
    expect(resolved.url).toBeNull();
    expect(resolved.before_url).toBeNull();
    expect(resolved.poster_url).toBeNull();
  });

  it("preserves all caller-facing row fields untouched", async () => {
    const client = makeClient((path) => ({ signedUrl: `signed:${path}` }));
    const resolved = await resolveCertificateMedia(client, baseRow, 60);
    expect(resolved.id).toBe(baseRow.id);
    expect(resolved.media_type).toBe(baseRow.media_type);
    expect(resolved.caption).toBe(baseRow.caption);
    expect(resolved.sort_order).toBe(baseRow.sort_order);
    expect(resolved.content_type).toBe(baseRow.content_type);
    expect(resolved.created_at).toBe(baseRow.created_at);
  });
});
