/**
 * 写真改ざん検出 — EXIF ファーストパス + Vision セカンドパス。
 *
 * 設計:
 * - EXIF 解析 (exifr) で疑わしい写真を素早く絞り込む。これだけで処理完結できる
 *   ケースは Vision を呼ばない (コスト・速度の最適化)。
 * - EXIF が灰色 (確定できないが怪しい) の場合のみ Vision に渡す。
 * - 完全にクリアな写真には Vision を使わない (= 通常ケースで Anthropic 課金なし)。
 * - すべての判定は fail-open: エラー時は "inconclusive" を返し、発行を止めない。
 *
 * EXIF フラグ:
 * - software_edited: Adobe Photoshop / GIMP 等で処理された痕跡
 * - timestamp_future: 撮影日時が未来 (時計改ざんまたは別端末から持ってきた)
 * - timestamp_mismatch: before/after 写真の撮影間隔が 0 秒以下 (同一写真の疑い)
 * - duplicate_hash: ファイルハッシュが完全一致 (同一バイナリ)
 * - gps_extreme: GPS が範囲外 (緯度経度 0 / 無効値 / 極端な座標)
 */

import exifr from "exifr";
import { createHash } from "crypto";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_CRITICAL } from "@/lib/ai/client";

const TamperingVisionSchema = z.object({
  suspicious: z.boolean(),
  reason: z.string(),
});

// ─────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────

export type TamperingFlag =
  | "software_edited"
  | "timestamp_future"
  | "timestamp_mismatch"
  | "duplicate_hash"
  | "gps_extreme"
  | "exif_stripped"
  | "vision_suspicious";

export interface PhotoExifMeta {
  /** 撮影日時 (EXIF DateTimeOriginal) */
  takenAt: Date | null;
  /** GPS 緯度 */
  latitude: number | null;
  /** GPS 経度 */
  longitude: number | null;
  /** 機種名 */
  deviceModel: string | null;
  /** 処理ソフト (Photoshop 等) */
  software: string | null;
  /** EXIF が存在するか */
  hasExif: boolean;
}

export interface PhotoTamperingResult {
  photoIndex: number;
  sha256: string;
  exifMeta: PhotoExifMeta;
  flags: TamperingFlag[];
  /** "clear" = 改ざんなし確定 / "suspicious" = 疑い / "inconclusive" = 判定不能 */
  verdict: "clear" | "suspicious" | "inconclusive";
  /** Vision が生成した理由文 (Vision を呼んだ場合のみ) */
  visionReason: string | null;
}

export interface TamperingAuditResult {
  /** 写真ごとの判定 */
  results: PhotoTamperingResult[];
  /** suspicious 件数 > 0 なら true */
  anyFlagged: boolean;
  /** 全写真の verdict サマリ */
  summary: string;
}

// ─────────────────────────────────────────────
// EXIF 解析
// ─────────────────────────────────────────────

export async function extractExifMeta(buffer: ArrayBuffer): Promise<PhotoExifMeta> {
  try {
    const data = await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      // exifr は多くのタグを取れるが最小限に絞る
      pick: ["DateTimeOriginal", "DateTime", "GPSLatitude", "GPSLongitude", "Make", "Model", "Software"],
    });

    if (!data) {
      return { takenAt: null, latitude: null, longitude: null, deviceModel: null, software: null, hasExif: false };
    }

    return {
      takenAt: data.DateTimeOriginal ?? data.DateTime ?? null,
      latitude: data.GPSLatitude ?? null,
      longitude: data.GPSLongitude ?? null,
      deviceModel: data.Model ? `${data.Make ?? ""} ${data.Model}`.trim() : null,
      software: data.Software ?? null,
      hasExif: true,
    };
  } catch {
    return { takenAt: null, latitude: null, longitude: null, deviceModel: null, software: null, hasExif: false };
  }
}

// ─────────────────────────────────────────────
// EXIF フラグ判定 (純関数)
// ─────────────────────────────────────────────

const EDIT_SOFTWARE_PATTERNS = /photoshop|lightroom|gimp|affinity|snapseed|facetune|meitu/i;

/**
 * これらの flag を持つ写真は Vision の結果に関わらず verdict=suspicious が確定するため、
 * 高価な Vision (Opus) 呼び出しをスキップしてよい (最終 verdict 判定と整合)。
 */
const DECISIVE_TAMPERING_FLAGS = new Set<TamperingFlag>(["software_edited", "duplicate_hash", "timestamp_mismatch"]);

export function detectExifFlags(
  meta: PhotoExifMeta,
  now: Date,
  allMeta: PhotoExifMeta[],
  photoIndex: number,
): TamperingFlag[] {
  const flags: TamperingFlag[] = [];

  // EXIF が完全に除去されている (スクリーンショット、再エクスポート後など)
  if (!meta.hasExif) {
    flags.push("exif_stripped");
    return flags; // 他のチェックは EXIF 前提なので skip
  }

  // 編集ソフトの痕跡
  if (meta.software && EDIT_SOFTWARE_PATTERNS.test(meta.software)) {
    flags.push("software_edited");
  }

  // 撮影日が未来 (2 分の余裕を持つ)
  if (meta.takenAt && meta.takenAt.getTime() > now.getTime() + 2 * 60 * 1000) {
    flags.push("timestamp_future");
  }

  // GPS が極端な値 (0,0 = ガーナ沖; 90,180 等の境界値)
  if (
    meta.latitude != null &&
    meta.longitude != null &&
    (Math.abs(meta.latitude) < 0.01 || Math.abs(meta.longitude) < 0.01 || Math.abs(meta.latitude) > 85)
  ) {
    flags.push("gps_extreme");
  }

  // before/after の撮影時刻が同一 or 逆転 (index 1 以降で前の写真と比較)
  if (photoIndex > 0 && meta.takenAt) {
    const prev = allMeta[photoIndex - 1];
    if (prev?.takenAt) {
      const diffMs = meta.takenAt.getTime() - prev.takenAt.getTime();
      if (Math.abs(diffMs) < 1000) {
        // 1 秒未満: 同一写真の疑い
        flags.push("timestamp_mismatch");
      }
    }
  }

  return flags;
}

// ─────────────────────────────────────────────
// SHA-256 ハッシュ
// ─────────────────────────────────────────────

function sha256(buffer: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

// ─────────────────────────────────────────────
// Vision セカンドパス (疑わしい写真のみ)
// ─────────────────────────────────────────────

async function visionTamperingCheck(
  base64: string,
  mediaType: string,
  flags: TamperingFlag[],
): Promise<{ suspicious: boolean; reason: string }> {
  try {
    const client = getAnthropicClient();
    const flagHints = flags.map((f) => `・${f}`).join("\n");

    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        // 改ざん判定は低頻度・高ステークス (証明書の信頼性 / ブロックチェーン anchoring の
        // 根拠) なので最大火力モデルを使う。EXIF で疑わしいと絞り込んだ写真のみ到達するため
        // 総コスト影響は小さい。
        model: AI_MODEL_CRITICAL,
        max_tokens: 256,
        system: `あなたは写真の真正性を審査する専門家です。
EXIF 解析で以下のフラグが検出されました:
${flagHints}

この写真が改ざんされていないかを視覚的に確認し、JSONで回答してください:
{"suspicious": true/false, "reason": "根拠を1文で（改ざんなしなら空文字）"}`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: base64,
                },
              },
              { type: "text", text: "この写真は改ざんされていますか？JSONで回答してください。" },
            ],
          },
        ],
        output_config: { format: zodOutputFormat(TamperingVisionSchema) },
      }),
    );

    const parsed = msg.parsed_output;
    return { suspicious: parsed?.suspicious ?? false, reason: parsed?.reason ?? "" };
  } catch {
    return { suspicious: false, reason: "" };
  }
}

// ─────────────────────────────────────────────
// メインエントリポイント
// ─────────────────────────────────────────────

/**
 * 複数写真を EXIF → Vision (疑わしいもののみ) の順で改ざんチェックする。
 *
 * @param photoBuffers ArrayBuffer と content-type のペア配列
 * @param now テスト用に差し替え可能な現在時刻
 */
export async function auditPhotoTampering(
  photoBuffers: Array<{ buffer: ArrayBuffer; contentType: string }>,
  now = new Date(),
  opts: { useVision?: boolean } = {},
): Promise<TamperingAuditResult> {
  if (photoBuffers.length === 0) {
    return { results: [], anyFlagged: false, summary: "写真なし" };
  }

  // 1. 全写真の EXIF + ハッシュを並列取得
  const [metas, hashes] = await Promise.all([
    Promise.all(photoBuffers.map((p) => extractExifMeta(p.buffer))),
    Promise.resolve(photoBuffers.map((p) => sha256(p.buffer))),
  ]);

  // 2. 重複ハッシュ検出
  const hashCount = new Map<string, number>();
  for (const h of hashes) hashCount.set(h, (hashCount.get(h) ?? 0) + 1);

  // 3. 各写真のフラグ判定
  const partialResults: Array<{
    idx: number;
    meta: PhotoExifMeta;
    hash: string;
    flags: TamperingFlag[];
    contentType: string;
    base64: string;
  }> = photoBuffers.map((p, idx) => {
    const meta = metas[idx];
    const hash = hashes[idx];
    const flags = detectExifFlags(meta, now, metas, idx);
    if ((hashCount.get(hash) ?? 0) > 1) flags.push("duplicate_hash");
    const base64 = Buffer.from(p.buffer).toString("base64");
    return { idx, meta, hash, flags, contentType: p.contentType, base64 };
  });

  // 4. Vision に回すのは「曖昧な (inconclusive 止まりの) flag」を持つ写真のみ。
  //    - useVision=false (コストキャップ超過等) → Vision を一切呼ばず EXIF だけで判定
  //    - exif_stripped のみ → skip (古いスキャナ等で頻出)
  //    - 決定的 flag (software_edited / duplicate_hash / timestamp_mismatch) を持つ写真は
  //      Vision の結果に関わらず verdict=suspicious 確定なので、高価な Opus 呼び出しを省く。
  const useVision = opts.useVision !== false;
  const visionTargets = useVision
    ? partialResults.filter((r) => {
        if (r.flags.length === 0) return false;
        if (r.flags.length === 1 && r.flags[0] === "exif_stripped") return false;
        if (r.flags.some((f) => DECISIVE_TAMPERING_FLAGS.has(f))) return false;
        return true;
      })
    : [];

  const visionResults = await Promise.all(
    visionTargets.map((r) => visionTamperingCheck(r.base64, r.contentType, r.flags)),
  );
  const visionMap = new Map(visionTargets.map((r, i) => [r.idx, visionResults[i]]));

  // 5. 最終 verdict
  const results: PhotoTamperingResult[] = partialResults.map((r) => {
    const vision = visionMap.get(r.idx);
    const finalFlags = [...r.flags];
    if (vision?.suspicious) finalFlags.push("vision_suspicious");

    const verdict: PhotoTamperingResult["verdict"] =
      finalFlags.includes("vision_suspicious") ||
      finalFlags.includes("software_edited") ||
      finalFlags.includes("duplicate_hash") ||
      finalFlags.includes("timestamp_mismatch")
        ? "suspicious"
        : finalFlags.length === 0
          ? "clear"
          : "inconclusive";

    return {
      photoIndex: r.idx,
      sha256: r.hash,
      exifMeta: r.meta,
      flags: finalFlags,
      verdict,
      visionReason: vision?.reason || null,
    };
  });

  const anyFlagged = results.some((r) => r.verdict === "suspicious");
  const suspCount = results.filter((r) => r.verdict === "suspicious").length;
  const summary =
    suspCount > 0
      ? `${suspCount} 枚に改ざんの疑いがあります`
      : results.every((r) => r.verdict === "clear")
        ? "写真はすべてクリアです"
        : "一部の写真で EXIF が不完全です（判定不能）";

  return { results, anyFlagged, summary };
}
