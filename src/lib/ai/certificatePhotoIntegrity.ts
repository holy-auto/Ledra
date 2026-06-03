/**
 * 証明書写真の改ざんスクリーニング (集約・純関数)。
 *
 * 設計の要点:
 * - 写真アップロード経路 (`/api/certificates/images/upload`) は **アップロード時** に
 *   各画像の整合性シグナルを `certificate_images` に保存している:
 *     sha256 / perceptual_hash (重複検出) ・ exif_captured_at / exif_device_model
 *     (撮影メタ、※GPS は保存前に除去) ・ deepfake_verdict (ディープフェイク判定AI) ・
 *     authenticity_grade。
 * - アップロード時に EXIF/GPS を除去・再エンコードするため、**保存後の画像から EXIF を
 *   再解析しても劣化する**。最も濃いシグナルは「アップロード時に取得済みの DB 列」側にある。
 * - そこで本モジュールは、それら **既存の (ディープフェイク判定AIを含む) シグナルを
 *   証明書単位の改ざん判定に集約** する。追加の画像ダウンロードも新規 AI 呼び出しも不要で、
 *   コストゼロ・確定的・テスト容易。
 *
 * 壁3 とは無関係: 出力は注釈 (verdict / flags) のみで、発行・金額・本人確認には関与しない。
 */

import { createHash } from "crypto";

export type PhotoIntegrityFlag =
  | "duplicate_image" // 同一 sha256 / perceptual_hash が証明書内で複数 (使い回し)
  | "deepfake_suspected" // ディープフェイク判定が likely_fake
  | "capture_time_future" // 撮影日時が未来 (時計改ざん / 別端末)
  | "metadata_missing"; // 撮影メタが無い (スクショ / 再エクスポート等)

export type IntegrityVerdict = "clear" | "suspicious" | "inconclusive";

/** 単一画像の判定を確定させる (= verdict=suspicious) 決定的フラグ。 */
const DECISIVE_FLAGS: ReadonlySet<PhotoIntegrityFlag> = new Set<PhotoIntegrityFlag>([
  "duplicate_image",
  "deepfake_suspected",
  "capture_time_future",
]);

/** certificate_images から集約に必要な最小列だけを抜き出した入力。 */
export interface CertImageIntegrityInput {
  id: string;
  sha256: string | null;
  perceptualHash: string | null;
  capturedAt: string | Date | null;
  deviceModel: string | null;
  deepfakeVerdict: string | null;
  authenticityGrade: string | null;
}

export interface ImageIntegrityVerdict {
  imageId: string;
  flags: PhotoIntegrityFlag[];
  verdict: IntegrityVerdict;
}

export interface CertificateIntegritySummary {
  verdict: IntegrityVerdict;
  anyFlagged: boolean;
  suspiciousCount: number;
  imageCount: number;
  /** 全画像のフラグ和集合。 */
  flags: PhotoIntegrityFlag[];
  perImage: ImageIntegrityVerdict[];
  summary: string;
  /**
   * 同じ画像集合に対する再実行をスキップするための署名 (sha256 群のハッシュ)。
   * 画像が増減・差替えされたときだけ値が変わる。
   */
  signature: string;
}

function parseDate(value: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 画像集合の署名 (id+sha256 をソートして連結し sha256)。 */
export function computeIntegritySignature(images: CertImageIntegrityInput[]): string {
  const keys = images.map((im) => `${im.id}:${im.sha256 ?? ""}`).sort();
  return createHash("sha256").update(keys.join("|")).digest("hex");
}

/**
 * 証明書の画像群を、アップロード時シグナルから改ざんスクリーニングする。
 *
 * - duplicate_image: 同一 sha256 もしくは同一 perceptual_hash が複数 → 使い回しの疑い
 * - deepfake_suspected: deepfake_verdict === "likely_fake"
 * - capture_time_future: 撮影日時が現在+2分より未来
 * - metadata_missing: 撮影日時も端末も無い (弱いシグナル → inconclusive 止まり)
 */
export function aggregateCertificateImageIntegrity(
  images: CertImageIntegrityInput[],
  now: Date = new Date(),
): CertificateIntegritySummary {
  const imageCount = images.length;
  if (imageCount === 0) {
    return {
      verdict: "inconclusive",
      anyFlagged: false,
      suspiciousCount: 0,
      imageCount: 0,
      flags: [],
      perImage: [],
      summary: "写真なし",
      signature: "",
    };
  }

  // 重複検出: sha256 / perceptual_hash の出現回数を数える (null は対象外)。
  const shaCount = new Map<string, number>();
  const phashCount = new Map<string, number>();
  for (const im of images) {
    if (im.sha256) shaCount.set(im.sha256, (shaCount.get(im.sha256) ?? 0) + 1);
    if (im.perceptualHash) phashCount.set(im.perceptualHash, (phashCount.get(im.perceptualHash) ?? 0) + 1);
  }

  const futureCutoff = now.getTime() + 2 * 60 * 1000;

  const perImage: ImageIntegrityVerdict[] = images.map((im) => {
    const flags: PhotoIntegrityFlag[] = [];

    const isDuplicate =
      (im.sha256 != null && (shaCount.get(im.sha256) ?? 0) > 1) ||
      (im.perceptualHash != null && (phashCount.get(im.perceptualHash) ?? 0) > 1);
    if (isDuplicate) flags.push("duplicate_image");

    if (im.deepfakeVerdict === "likely_fake") flags.push("deepfake_suspected");

    const takenAt = parseDate(im.capturedAt);
    if (takenAt && takenAt.getTime() > futureCutoff) flags.push("capture_time_future");

    if (!takenAt && !im.deviceModel) flags.push("metadata_missing");

    const verdict: IntegrityVerdict = flags.some((f) => DECISIVE_FLAGS.has(f))
      ? "suspicious"
      : flags.length === 0
        ? "clear"
        : "inconclusive";

    return { imageId: im.id, flags, verdict };
  });

  const suspiciousCount = perImage.filter((r) => r.verdict === "suspicious").length;
  const inconclusiveCount = perImage.filter((r) => r.verdict === "inconclusive").length;

  const verdict: IntegrityVerdict =
    suspiciousCount > 0 ? "suspicious" : inconclusiveCount > 0 ? "inconclusive" : "clear";

  const flagSet = new Set<PhotoIntegrityFlag>();
  for (const r of perImage) for (const f of r.flags) flagSet.add(f);

  const summary =
    suspiciousCount > 0
      ? `${suspiciousCount} 枚に改ざんの疑いがあります`
      : inconclusiveCount > 0
        ? "一部の写真で撮影メタが不足しています（判定不能）"
        : "写真はすべてクリアです";

  return {
    verdict,
    anyFlagged: suspiciousCount > 0,
    suspiciousCount,
    imageCount,
    flags: [...flagSet],
    perImage,
    summary,
    signature: computeIntegritySignature(images),
  };
}
