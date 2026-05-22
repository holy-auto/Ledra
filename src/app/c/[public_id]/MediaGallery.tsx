import CertificateVideo from "./CertificateVideo";
import BeforeAfterSlider from "./BeforeAfterSlider";
import AnnotatedImage from "@/components/imageMarkup/AnnotatedImage";
import type { ResolvedCertificateMedia } from "@/lib/certificateMedia";

export type GalleryImage = {
  id: string;
  url: string | null;
  rendered_url?: string | null;
  annotations?: unknown;
  file_name: string | null;
  sort_order: number | null;
};

type GalleryItem =
  | {
      kind: "image";
      key: string;
      sortOrder: number;
      data: GalleryImage;
    }
  | {
      kind: "media";
      key: string;
      sortOrder: number;
      data: ResolvedCertificateMedia;
    };

type Props = {
  images: GalleryImage[];
  media: ResolvedCertificateMedia[];
};

/**
 * 公開ページの「添付メディア」セクション。
 * 写真 (certificate_images) + 動画 / Before-After (certificate_media) を
 * 1 つのギャラリーで束ね、sort_order の昇順で表示する。
 *
 * - 同じ sort_order の場合は images → media の順 (image が先に並ぶ)。
 * - 360°パノラマ (panorama360) は Phase 3 初版では未実装のため fallback リンクのみ。
 */
export default function MediaGallery({ images, media }: Props) {
  const items = mergeAndSort(images, media);
  if (items.length === 0) return null;

  return (
    <section className="glass-card p-4">
      <div className="mb-3 font-bold text-primary">添付メディア</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          if (item.kind === "image") {
            return <ImageTile key={item.key} image={item.data} />;
          }
          return <MediaTile key={item.key} media={item.data} />;
        })}
      </div>
    </section>
  );
}

export function mergeAndSort(images: GalleryImage[], media: ResolvedCertificateMedia[]): GalleryItem[] {
  const items: GalleryItem[] = [];

  for (const img of images) {
    if (!img.url) continue;
    items.push({
      kind: "image",
      key: `image-${img.id}`,
      sortOrder: img.sort_order ?? 0,
      data: img,
    });
  }
  for (const m of media) {
    items.push({
      kind: "media",
      key: `media-${m.id}`,
      sortOrder: m.sort_order ?? 0,
      data: m,
    });
  }

  // 並び順: sort_order 昇順 → 同値時は image が先に来るよう kind で安定化
  items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return items;
}

function ImageTile({ image }: { image: GalleryImage }) {
  if (!image.url) return null;
  const alt = image.file_name || `image_${image.sort_order ?? ""}`;
  // 表示用 URL: 焼き込み済みがあれば優先、なければ原画像 (注釈は AnnotatedImage が SVG オーバーレイで描画)。
  const displayUrl = String(image.rendered_url ?? image.url);
  return (
    <a
      href={displayUrl}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-border-default p-2.5 no-underline transition-colors hover:border-accent/50 hover:bg-surface-hover"
    >
      <AnnotatedImage
        imageUrl={String(image.url)}
        renderedUrl={image.rendered_url ?? null}
        annotations={image.annotations}
        alt={alt}
        className="block h-[180px] w-full rounded-lg border border-border-default bg-base object-cover"
      />
      <div className="mt-2 text-xs text-muted">{alt}</div>
    </a>
  );
}

function MediaTile({ media }: { media: ResolvedCertificateMedia }) {
  switch (media.media_type) {
    case "video":
      if (!media.url) return null;
      return (
        <div className="rounded-xl border border-border-default p-2.5">
          <CertificateVideo
            src={media.url}
            poster={media.poster_url}
            caption={media.caption}
            width={media.width}
            height={media.height}
            durationMs={media.duration_ms}
          />
        </div>
      );
    case "before_after":
      if (!media.url || !media.before_url) return null;
      return (
        <div className="rounded-xl border border-border-default p-2.5">
          <BeforeAfterSlider
            beforeSrc={media.before_url}
            afterSrc={media.url}
            caption={media.caption}
            width={media.width}
            height={media.height}
          />
          {media.diff_summary ? (
            <div
              className="mt-3 rounded-lg bg-surface-hover p-3 text-xs leading-relaxed text-muted"
              aria-label="AI生成の差分サマリ"
            >
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                AI による施工差分
              </div>
              <p className="text-primary">{media.diff_summary}</p>
            </div>
          ) : null}
        </div>
      );
    case "panorama360":
      // 初版スコープ外: Viewer 未実装。fallback リンクで存在だけ示す。
      if (!media.url) return null;
      return (
        <a
          href={media.url}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl border border-border-default p-2.5 text-xs text-muted no-underline hover:border-accent/50 hover:bg-surface-hover"
        >
          {media.caption ?? "360°パノラマ"}（外部表示）
        </a>
      );
    default:
      return null;
  }
}
