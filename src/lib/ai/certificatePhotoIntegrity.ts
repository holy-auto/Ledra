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
 * - DB シグナルだけでは判定不能 (inconclusive) なグレーゾーン画像については、呼び出し側
 *   (photoTamperingAuto) が Opus Vision で内容審査し、その結果を `applyVisionVerdicts` で
 *   折り込む (Vision は画素ベースなので EXIF 除去後でも有効)。
 *
 * 壁3 とは無関係: 出力は注釈 (verdict / flags) のみで、発行・金額・本人確認には関与しない。
 */

import { createHash } from "crypto";

export type PhotoIntegrityFlag =
  | "duplicate_image" // 同一 sha256 / perceptual_hash が証明書内で複数 (使い回し)
  | "deepfake_suspected" // ディープフェイク判定が likely_fake
  | "capture_time_future" // 撮影日時が未来 (時計改ざん / 別端末)
  | "capture_time_stale" // 撮影日時がアップロードより大幅に前 (過去写真の使い回しの疑い)
  | "metadata_missing" // 撮影メタが無い (スクショ / 再エクスポート等)
  | "vision_suspicious"; // Opus Vision の内容審査で改ざんの疑い

export type IntegrityVerdict = "clear" | "suspicious" | "inconclusive";

/**
 * 撮影日時が、その写真の**アップロード時刻**より何日以上前だと「使い回しの疑い」とみなすか。
 *
 * 施工写真は通常、施工の当日〜数日以内に撮影・アップロードされる。アップロードより大幅に
 * 古い撮影日時の写真は「別案件・過去に撮った写真の使い回し」の可能性がある。
 *
 * 基準を証明書の発行 (issue) 時刻ではなく **各写真自身のアップロード時刻** に取るのは、
 * 証明書が draft で先に作られ後から active 化される運用だと、created_at では
 * 「1月に開いた draft を6月に1月の写真で発行」というケースを取りこぼすため
 * (アップロード時刻なら 6月アップロード vs 1月撮影 で正しく stale になる)。
 *
 * ただし端末の時計狂い等の正当なケースもあるため、**決定的 (suspicious) にはせず
 * inconclusive 止まり**にして Vision の内容審査へ回す。閾値は誤検知を避けるため
 * 保守的に広めに取る。
 */
export const STALE_CAPTURE_DAYS = 60;
const STALE_CAPTURE_MS = STALE_CAPTURE_DAYS * 24 * 60 * 60 * 1000;

/** 単一画像の判定を確定させる (= verdict=suspicious) 決定的フラグ。 */
const DECISIVE_FLAGS: ReadonlySet<PhotoIntegrityFlag> = new Set<PhotoIntegrityFlag>([
  "duplicate_image",
  "deepfake_suspected",
  "capture_time_future",
  "vision_suspicious",
]);

/** certificate_images から集約に必要な最小列だけを抜き出した入力。 */
export interface CertImageIntegrityInput {
  id: string;
  sha256: string | null;
  perceptualHash: string | null;
  capturedAt: string | Date | null;
  /** この写真がアップロード (登録) された時刻 = certificate_images.created_at。stale 判定の基準。 */
  uploadedAt: string | Date | null;
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

/** フラグ集合から単一画像の verdict を導く。 */
function imageVerdict(flags: PhotoIntegrityFlag[]): IntegrityVerdict {
  if (flags.some((f) => DECISIVE_FLAGS.has(f))) return "suspicious";
  return flags.length === 0 ? "clear" : "inconclusive";
}

/** 画像ごとの判定から証明書単位のロールアップを作る。 */
function rollupSummary(
  perImage: ImageIntegrityVerdict[],
  imageCount: number,
  signature: string,
): CertificateIntegritySummary {
  const suspiciousCount = perImage.filter((r) => r.verdict === "suspicious").length;
  const inconclusiveCount = perImage.filter((r) => r.verdict === "inconclusive").length;

  const verdict: IntegrityVerdict =
    suspiciousCount > 0 ? "suspicious" : inconclusiveCount > 0 ? "inconclusive" : "clear";

  const flagSet = new Set<PhotoIntegrityFlag>();
  for (const r of perImage) for (const f of r.flags) flagSet.add(f);

  // inconclusive の内訳をフラグに応じて言い分ける (stale をメタ欠落と混同しない)。
  // このブランチに来る時点で suspiciousCount===0 のため、flagSet は inconclusive 級
  // (capture_time_stale / metadata_missing) のみ。
  const inconclusiveReasons: string[] = [];
  if (flagSet.has("capture_time_stale"))
    inconclusiveReasons.push("アップロードより大幅に前に撮影された写真（使い回しの疑い）");
  if (flagSet.has("metadata_missing")) inconclusiveReasons.push("撮影メタ（日時/端末）の不足");

  const summary =
    suspiciousCount > 0
      ? `${suspiciousCount} 枚に改ざんの疑いがあります`
      : inconclusiveCount > 0
        ? inconclusiveReasons.length > 0
          ? `要確認: ${inconclusiveReasons.join("・")}（判定不能）`
          : "一部の写真は判定できません（判定不能）"
        : "写真はすべてクリアです";

  return {
    verdict,
    anyFlagged: suspiciousCount > 0,
    suspiciousCount,
    imageCount,
    flags: [...flagSet],
    perImage,
    summary,
    signature,
  };
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
 * - capture_time_stale: 撮影日時が、その写真のアップロード時刻 (uploadedAt) より
 *   STALE_CAPTURE_DAYS 以上前 (過去写真の使い回しの疑い / 弱いシグナル → inconclusive 止まり)
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
    // 未来でない撮影のみ stale 判定 (未来は capture_time_future で既に拾っている)。
    // 基準は各写真自身のアップロード時刻 (uploadedAt)。アップロードより
    // STALE_CAPTURE_DAYS 以上前に撮影された写真は「使い回し」の疑い。
    else if (takenAt) {
      const uploadedAt = parseDate(im.uploadedAt);
      if (uploadedAt && takenAt.getTime() < uploadedAt.getTime() - STALE_CAPTURE_MS) flags.push("capture_time_stale");
    }

    if (!takenAt && !im.deviceModel) flags.push("metadata_missing");

    return { imageId: im.id, flags, verdict: imageVerdict(flags) };
  });

  return rollupSummary(perImage, imageCount, computeIntegritySignature(images));
}

/**
 * Vision 審査に回す「グレーゾーン」画像 (DB シグナルだけでは判定不能 = inconclusive) の
 * id を、撮影順 (perImage の順) で最大 maxN 件返す。clear / suspicious は対象外
 * (clear は AI 不要 / suspicious は既に確定)。
 */
export function pickGrayZoneImageIds(summary: CertificateIntegritySummary, maxN: number): string[] {
  const ids: string[] = [];
  for (const r of summary.perImage) {
    if (r.verdict === "inconclusive") ids.push(r.imageId);
    if (ids.length >= maxN) break;
  }
  return ids;
}

/**
 * Vision の内容審査結果 (imageId -> {suspicious}) を集約結果に折り込む。
 * suspicious と判定された画像に vision_suspicious フラグを足し、verdict / ロールアップを
 * 再計算する。Vision がクリア (suspicious=false) なら撮影メタ欠落は依然 inconclusive のまま
 * (Vision は能動的な改ざんを否定するだけで、来歴の欠落は埋めない)。
 */
export function applyVisionVerdicts(
  summary: CertificateIntegritySummary,
  visionByImageId: Record<string, { suspicious: boolean }>,
): CertificateIntegritySummary {
  if (summary.imageCount === 0) return summary;
  const perImage: ImageIntegrityVerdict[] = summary.perImage.map((r) => {
    const v = visionByImageId[r.imageId];
    if (!v?.suspicious || r.flags.includes("vision_suspicious")) return r;
    const flags = [...r.flags, "vision_suspicious" as const];
    return { imageId: r.imageId, flags, verdict: imageVerdict(flags) };
  });
  return rollupSummary(perImage, summary.imageCount, summary.signature);
}
