/**
 * 写真打刻 — 施工写真の EXIF 撮影時刻から「施工日」と「作業時間」を推定する純関数。
 *
 * 目的: 職人/フロントが日付や作業時間を手入力しなくても、撮影済み写真から
 * 施工日・作業時間の下書きを自動で用意する（AITURBO の写真打刻に相当）。
 * ここは提案の計算のみ。確定（フォームへの反映）は必ず人が行う。
 *
 * 重要な時刻の扱い（要注意・calibration）:
 *   `certificate_images.exif_captured_at` は
 *   「ナイーブな EXIF 壁時計（オフセット無し）を *取り込んだサーバの tz* で解釈し
 *    `toISOString()` で UTC 化」したもの（processUploadedPhoto.ts で生成）。
 *   Vercel / 多くのコンテナはサーバ tz=UTC で動くため、保存された ISO の **UTC 成分**が
 *   カメラの壁時計の Y-M-D-h-m をそのまま保持している。したがって施工日は
 *   **UTC 成分をそのまま読む**のが正しく、Asia/Tokyo へ変換すると +9h で日付がずれる。
 *   // ponytail: exif_captured_at を「サーバ tz=UTC で取り込んだ」前提で UTC 成分を施工日とする。
 *   //   天井: UTC 以外の tz で取り込んだ写真は施工日が最大 ±1 日ずれる。海外 tz の端末時計も同様。
 *   作業時間は latest-earliest の差分なので tz に不変（この前提に依存しない）。
 */

export interface PhotoStampInput {
  /** certificate_images.exif_captured_at（ISO 文字列 or Date）。無ければ null。 */
  capturedAt: Date | string | null;
  /** certificate_images.stage（任意・現状ロジックでは未使用だが将来の重み付け用に受ける）。 */
  stage?: string | null;
}

export type WorkStampWarning =
  | "no_exif" // 使える撮影時刻が 1 枚も無い
  | "single_photo" // 1 枚のみ → 作業時間を出せない
  | "insane_clock" // 明らかに壊れた時計を除外した
  | "wide_spread" // earliest→latest が広すぎる（別日の写真混入の疑い）
  | "stale_album"; // 予約日から大きく外れる（アルバムの古い写真の疑い）

export interface WorkStampSuggestion {
  /** "YYYY-MM-DD"（UTC 成分＝カメラ壁時計の日付）。出せなければ null。 */
  workDate: string | null;
  /** 作業時間（分）。1 枚のみ/広すぎ/データ無なら null。 */
  workMinutes: number | null;
  confidence: "high" | "low" | "none";
  basis: {
    usable: number;
    total: number;
    earliestIso: string | null;
    latestIso: string | null;
  };
  warnings: WorkStampWarning[];
}

export interface DeriveWorkStampOptions {
  /** テスト用に "今" を注入（未指定は new Date()）。 */
  now?: Date;
  /** 予約 scheduled_date（"YYYY-MM-DD"）。撮影日がここから離れると stale_album。 */
  expectedDate?: string | null;
  /** 1 案件の写真の許容時間幅（時間）。既定 12h。 */
  maxWorkHours?: number;
}

/** これより前の時刻は「壊れた時計」として捨てる（EXIF 未設定端末は 1970/2000 等を返す）。 */
const SANE_MIN_MS = Date.UTC(2015, 0, 1);
/** 未来方向の許容（撮影直後アップロードの時計ずれを吸収）。 */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
/** 施工日と予約日の許容乖離（日）。超えると stale_album。 */
const STALE_ALBUM_DAYS = 3;

function toMs(v: Date | string | null): number | null {
  if (v == null) return null;
  const ms = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/** UTC 成分から "YYYY-MM-DD"（施工日）。tz 変換しないのが肝（上のコメント参照）。 */
function utcDateString(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" 同士の日数差（絶対値）。不正入力は Infinity（＝乖離扱い）。 */
function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(Math.round((ta - tb) / 86_400_000));
}

/**
 * 施工写真の撮影時刻群から施工日・作業時間の提案を導出する。純関数・fail-soft。
 */
export function deriveWorkStamp(inputs: PhotoStampInput[], opts: DeriveWorkStampOptions = {}): WorkStampSuggestion {
  const nowMs = (opts.now ?? new Date()).getTime();
  const maxSpreadMs = Math.max(0, opts.maxWorkHours ?? 12) * 60 * 60 * 1000;
  const total = inputs.length;
  const warnings = new Set<WorkStampWarning>();

  // 使える撮影時刻だけ残す（null/未パース/壊れた時計を除外）。
  const usable: number[] = [];
  let sawInsane = false;
  for (const it of inputs) {
    const ms = toMs(it.capturedAt);
    if (ms == null) continue;
    if (ms < SANE_MIN_MS || ms > nowMs + FUTURE_TOLERANCE_MS) {
      sawInsane = true;
      continue;
    }
    usable.push(ms);
  }
  if (sawInsane) warnings.add("insane_clock");

  if (usable.length === 0) {
    if (total > 0) warnings.add("no_exif");
    return {
      workDate: null,
      workMinutes: null,
      confidence: "none",
      basis: { usable: 0, total, earliestIso: null, latestIso: null },
      warnings: [...warnings],
    };
  }

  usable.sort((a, b) => a - b);
  const earliest = usable[0];
  const latest = usable[usable.length - 1];
  const workDate = utcDateString(earliest);

  // 作業時間: 2 枚以上かつ許容幅内のときだけ算出。広すぎは別日混入の疑いで null。
  let workMinutes: number | null = null;
  if (usable.length === 1) {
    warnings.add("single_photo");
  } else {
    const spread = latest - earliest;
    if (spread > maxSpreadMs) {
      warnings.add("wide_spread");
    } else {
      workMinutes = Math.round(spread / 60_000);
    }
  }

  // 予約日から大きく外れる撮影日はアルバムの古い写真の疑い。
  if (opts.expectedDate && dayDiff(workDate, opts.expectedDate) > STALE_ALBUM_DAYS) {
    warnings.add("stale_album");
  }

  const confidence: WorkStampSuggestion["confidence"] =
    warnings.has("stale_album") || warnings.has("wide_spread") ? "low" : "high";

  return {
    workDate,
    workMinutes,
    confidence,
    basis: {
      usable: usable.length,
      total,
      earliestIso: new Date(earliest).toISOString(),
      latestIso: new Date(latest).toISOString(),
    },
    warnings: [...warnings],
  };
}
