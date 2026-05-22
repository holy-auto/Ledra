// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MediaGallery, { mergeAndSort, type GalleryImage } from "../MediaGallery";
import type { ResolvedCertificateMedia } from "@/lib/certificateMedia";

function makeImage(over: Partial<GalleryImage> & { id: string; sort_order: number }): GalleryImage {
  return {
    id: over.id,
    url: "url" in over ? (over.url ?? null) : `https://signed/img/${over.id}.jpg`,
    file_name: over.file_name ?? `${over.id}.jpg`,
    sort_order: over.sort_order,
  };
}

function makeMedia(over: {
  id: string;
  media_type: ResolvedCertificateMedia["media_type"];
  sort_order: number;
  url?: string | null;
  before_url?: string | null;
  poster_url?: string | null;
  caption?: string | null;
}): ResolvedCertificateMedia {
  return {
    id: over.id,
    media_type: over.media_type,
    storage_path: `media/${over.id}_main.bin`,
    before_path: over.media_type === "before_after" ? `media/${over.id}_before.jpg` : null,
    poster_path: over.media_type === "video" ? `media/${over.id}_poster.jpg` : null,
    duration_ms: null,
    width: null,
    height: null,
    caption: over.caption ?? null,
    sort_order: over.sort_order,
    content_type: null,
    file_size: 0,
    created_at: null,
    diff_summary: null,
    diff_summary_generated_at: null,
    url: over.url === undefined ? `https://signed/main/${over.id}` : over.url,
    before_url:
      over.before_url === undefined
        ? over.media_type === "before_after"
          ? `https://signed/before/${over.id}`
          : null
        : over.before_url,
    poster_url:
      over.poster_url === undefined
        ? over.media_type === "video"
          ? `https://signed/poster/${over.id}`
          : null
        : over.poster_url,
  };
}

describe("MediaGallery.mergeAndSort", () => {
  it("returns empty list when both images and media are empty", () => {
    expect(mergeAndSort([], [])).toEqual([]);
  });

  it("orders by sort_order ascending across image and media types", () => {
    const images = [makeImage({ id: "i1", sort_order: 2 }), makeImage({ id: "i2", sort_order: 0 })];
    const media = [
      makeMedia({ id: "m1", media_type: "video", sort_order: 1 }),
      makeMedia({ id: "m2", media_type: "before_after", sort_order: 3 }),
    ];
    const items = mergeAndSort(images, media);
    expect(items.map((i) => i.key)).toEqual(["image-i2", "media-m1", "image-i1", "media-m2"]);
  });

  it("places image before media when sort_order ties (stable for tie-break)", () => {
    const images = [makeImage({ id: "img", sort_order: 5 })];
    const media = [makeMedia({ id: "vid", media_type: "video", sort_order: 5 })];
    const items = mergeAndSort(images, media);
    expect(items[0].kind).toBe("image");
    expect(items[1].kind).toBe("media");
  });

  it("filters out images with no resolvable url", () => {
    const images = [makeImage({ id: "valid", sort_order: 0 }), makeImage({ id: "broken", sort_order: 1, url: null })];
    const items = mergeAndSort(images, []);
    expect(items.map((i) => i.key)).toEqual(["image-valid"]);
  });
});

describe("MediaGallery render", () => {
  it("renders nothing when there are no items", () => {
    const { container } = render(<MediaGallery images={[]} media={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders all 3 media kinds (image + video + before_after) in one section", () => {
    const images = [makeImage({ id: "img1", sort_order: 0, file_name: "front.jpg" })];
    const media = [
      makeMedia({
        id: "vid1",
        media_type: "video",
        sort_order: 1,
        caption: "施工タイムラプス",
      }),
      makeMedia({
        id: "ba1",
        media_type: "before_after",
        sort_order: 2,
        caption: "ボンネット施工 Before/After",
      }),
    ];
    render(<MediaGallery images={images} media={media} />);
    expect(screen.getByText("添付メディア")).toBeDefined();
    // Image alt
    expect(screen.getByAltText("front.jpg")).toBeDefined();
    // Video play button (no <video> mounted until clicked)
    expect(screen.getByLabelText("施工タイムラプス を再生")).toBeDefined();
    // Before/After both labeled images
    expect(screen.getByAltText("ボンネット施工 Before/After (Before)")).toBeDefined();
    expect(screen.getByAltText("ボンネット施工 Before/After (After)")).toBeDefined();
  });

  it("falls back to a link when panorama360 lacks a viewer (initial release scope)", () => {
    const media = [makeMedia({ id: "p360", media_type: "panorama360", sort_order: 0, caption: "全周パノラマ" })];
    render(<MediaGallery images={[]} media={media} />);
    expect(screen.getByText(/全周パノラマ/)).toBeDefined();
  });

  it("skips a video media that lacks a signed URL", () => {
    const media = [makeMedia({ id: "v", media_type: "video", sort_order: 0, url: null })];
    const { container } = render(<MediaGallery images={[]} media={media} />);
    expect(container.querySelector("button[aria-label]")).toBeNull();
  });

  it("skips before_after when before_url is missing", () => {
    const media = [
      makeMedia({
        id: "ba",
        media_type: "before_after",
        sort_order: 0,
        before_url: null,
      }),
    ];
    const { container } = render(<MediaGallery images={[]} media={media} />);
    // Section still renders empty grid (no tiles)
    expect(container.querySelector("img")).toBeNull();
  });
});
