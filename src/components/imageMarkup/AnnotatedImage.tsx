/**
 * Phase 2: 公開ビュー向けの注釈画像表示コンポーネント。
 *
 * 表示優先順:
 *   1. renderedUrl があればそれを <img src> として表示 (サーバー側で焼き込み済み)
 *   2. annotations と imageUrl があれば、画像 <img> + 上に SVG オーバーレイ
 *   3. それ以外は素の <img>
 *
 * Server Component として動く必要があるため "use client" は付けない。
 *   - SVG は src/lib/imageMarkup/toSvg.ts で文字列生成 → JSX に挿入。
 *   - prefers-reduced-motion 配慮: 初期化アニメーションは付けない。
 */

import { annotationsToSvg } from "@/lib/imageMarkup/toSvg";
import { isAnnotationDocument, type AnnotationDocument } from "./types";

type Props = {
  /** 原画像 (rendered なし時のフォールバック) の URL。 */
  imageUrl: string;
  /** 焼き込み済み画像の URL。null なら未生成。 */
  renderedUrl?: string | null;
  /** 注釈ドキュメント。null/未設定でも安全。 */
  annotations?: AnnotationDocument | unknown;
  /** alt 文字列。 */
  alt: string;
  /** Tailwind クラス。 */
  className?: string;
};

export default function AnnotatedImage({ imageUrl, renderedUrl, annotations, alt, className }: Props) {
  // (1) サーバー側で焼き込み済みなら最優先で使う。
  if (renderedUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- 公開ビューは Image optimizer 不要
    return <img src={renderedUrl} alt={alt} className={className} loading="lazy" decoding="async" />;
  }

  // (2) クライアント焼きが無いケース: 注釈があれば <img> + SVG オーバーレイ。
  const doc = isAnnotationDocument(annotations) ? (annotations as AnnotationDocument) : null;
  if (doc && doc.annotations.length > 0) {
    const svg = annotationsToSvg(doc);
    return (
      <span className={`relative inline-block ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 公開ビューは Image optimizer 不要 */}
        <img src={imageUrl} alt={alt} className="block h-full w-full object-cover" loading="lazy" decoding="async" />
        <span
          aria-hidden="true"
          // 挿入 SVG は原画像の px 実寸 (width/height) を持つ。object-cover した
          // <img> に重ねるため、子 <svg> をボックス全面に伸ばす。SVG 側は
          // preserveAspectRatio="xMidYMid slice" で object-cover と同じトリミング。
          className="pointer-events-none absolute inset-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          // dangerouslySetInnerHTML: SVG 文字列は src/lib/imageMarkup/toSvg.ts で
          // XML エスケープ済み。テキストはユーザー入力でも escapeXml() を通す。
          // 色・座標は数値・正規表現で sanitize 済み。
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </span>
    );
  }

  // (3) 注釈なし。
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 公開ビューは Image optimizer 不要
    <img src={imageUrl} alt={alt} className={className} loading="lazy" decoding="async" />
  );
}
