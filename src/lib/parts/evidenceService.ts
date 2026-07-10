/**
 * 装着エビデンス写真の「作成前ステージ」アップロード（現場タブレットの撮るだけ経路）。
 *
 * 設計: docs/parts-installation-integrity-design.md（証拠の真正性 L2 / 使い回し検知 L7）
 *
 * 既存の作成 API (`POST /api/parts/installations`) は「アップロード済みの写真メタ
 * (storage_path / sha256 / perceptual_hash / exif_captured_at)」を前提にしていたが、
 * 実際に写真を撮影→アップロードしてハッシュ・EXIF を付与する経路は納品書用しか
 * 無かった。本サービスはその欠落を埋め、**装着レコード作成の前に** 写真を 1 枚
 * ステージし、サーバ側で算出した真正性メタを返す。クライアントはそのメタを作成 API の
 * `evidence[]` に渡すため、写真は content_hash（顧客が署名する manifest）に確実に
 * 取り込まれる（＝作成後に追記せず、署名対象の外に漏れない）。
 *
 *  1. SHA-256（バイト改ざん検知。クライアント送信値は信用しない）。
 *  2. 知覚ハッシュ（aHash。再圧縮・微編集に耐え、使い回しを検出）。
 *  3. EXIF 撮影日時 (DateTimeOriginal) と改ざん疑い flag（編集ソフト痕跡・撮影時刻異常等）。
 *  4. EXIF の有無・flag で真正性グレードを付与。
 *  5. GPS/EXIF を除去した上で assets バケットへ保存し storage_path を返す
 *     （ハッシュは保存する除去後バイトで算出する）。
 *  6. RFC3161 TSA（`PARTS_TSA_*`）でハッシュに存在時刻を封印（設定時のみ・fail-open）。
 *     確定署名 (signConfirmation) は required_assurance='any' なら起きないことがあり、
 *     その場合ここが写真に付く唯一の時刻封印になる。
 *
 * TSA は現状グレード計算 (authenticity_grade) には反映しない — グレードは引き続き
 * EXIF/改ざんflag のみで決まる (unverified|basic)。端末アテステーション・単回nonce
 * 束縛が無い状態で TSA だけを理由に verified へ引き上げるのは certificate_images の
 * `computeAuthenticityGrade` の意味論（deviceOk && nonceOk && captureTimeSealOk）と
 * 矛盾するため、当面は監査用メタとして記録するに留める。
 *
 * 重複・シリアル使い回し・flag→finding の記録は作成 API (createInstallation) 側で、
 * content_hash 確定と同じトランザクション文脈で行う（本サービスは DB 行を作らない）。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages"; // 共有 "assets" バケット
import { hashSha256, computePerceptualHash } from "@/lib/anchoring/imageHashing";
import { stripGpsAndReadExif } from "@/lib/anchoring/imageExif";
import { extractExifMeta, detectExifFlags, type TamperingFlag } from "@/lib/ai/photoTamperingCheck";
import { requestEvidenceTimestamp } from "@/lib/parts/evidenceTsa";

type Admin = ReturnType<typeof createTenantScopedAdmin>["admin"];

/** 装着写真として撮影・アップロードできる kind（納品書は専用経路を持つので除く）。 */
export const INSTALL_PHOTO_KINDS = [
  "install_photo",
  "context_photo",
  "old_part_photo",
  "removed_part",
  "seal",
  "marking",
] as const;
export type InstallPhotoKind = (typeof INSTALL_PHOTO_KINDS)[number];

export interface StagedPhoto {
  storage_path: string;
  sha256: string;
  perceptual_hash: string;
  exif_captured_at: string | null;
  authenticity_grade: "unverified" | "basic";
  /** EXIF から検出した改ざん疑い flag（作成時に finding 化される）。 */
  integrity_flags: TamperingFlag[];
  /** RFC3161 TSA局（PARTS_TSA_* 未設定/失敗時は null）。 */
  tsa_authority: string | null;
  /** TSA局が証明した存在時刻。 */
  tsa_timestamp_at: string | null;
}

/**
 * 装着写真を 1 枚ステージ（保存＋真正性メタ算出）する。DB 行は作らない。
 * 返したメタを作成 API の evidence[] に渡すことで content_hash に取り込まれる。
 */
export async function stageInstallationPhoto(opts: {
  admin: Admin;
  tenantId: string;
  kind: InstallPhotoKind;
  buffer: Buffer;
  arrayBuffer: ArrayBuffer;
  mime: string;
}): Promise<StagedPhoto> {
  const { admin, tenantId, kind, buffer, arrayBuffer, mime } = opts;

  // 1) 改ざん判定は「元画像」の EXIF（GPS 含む）で行う。gps_extreme 等は除去前でしか見えない。
  const exif = await extractExifMeta(arrayBuffer);
  const integrityFlags = detectExifFlags(exif, new Date(), [exif], 0);
  const exifCapturedAt = exif.takenAt ? new Date(exif.takenAt).toISOString() : null;
  // EXIF があり改ざん疑い flag が無ければ basic、それ以外（EXIF 無し・編集痕跡等）は unverified。
  const authenticityGrade: "unverified" | "basic" =
    exif.hasExif && integrityFlags.length === 0 ? "basic" : "unverified";

  // 2) 保存する前に GPS/EXIF を除去する。装着写真も顧客の自宅駐車場等で撮られ得るため、
  //    証明書写真経路 (imageExif.stripGpsAndReadExif) と同一のプライバシー保護を適用する
  //    （同じ assets バケットへ生 GPS を残さない）。ハッシュは「実際に保存するバイト」で
  //    算出しないと content_hash と保存ファイルが食い違うため、除去後バッファを対象にする。
  const stripped = await stripGpsAndReadExif(buffer);
  const uploadBuffer = stripped.strippedBuffer;
  const sha256 = hashSha256(uploadBuffer);
  const perceptualHash = await computePerceptualHash(uploadBuffer);

  // 撮影時封印: RFC3161 TSA（未設定/失敗は null — アップロードを止めない）。
  const tsa = await requestEvidenceTimestamp(sha256);

  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const storagePath = `parts/${tenantId}/staging/${kind}-${Date.now()}-${sha256.slice(0, 8)}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(CERTIFICATE_IMAGE_BUCKET)
    .upload(storagePath, uploadBuffer, { contentType: mime, upsert: false });
  if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);

  return {
    storage_path: storagePath,
    sha256,
    perceptual_hash: perceptualHash,
    exif_captured_at: exifCapturedAt,
    authenticity_grade: authenticityGrade,
    integrity_flags: integrityFlags,
    tsa_authority: tsa?.authority ?? null,
    tsa_timestamp_at: tsa?.timestampAt ?? null,
  };
}
