/**
 * 電子車検証 二次元コード（QR）デコード & パース
 *
 * 国土交通省「電子車検証 二次元コード記載項目一覧（2023.1 版）」に準拠。
 * - 二次元コード２: 登録番号・車台番号・原動機型式など（6フィールド、コード分割数 2）
 * - 二次元コード３: 型式・有効期間・軸重・燃料種別など（21フィールド、コード分割数 3）
 *
 * フィールドは半角スラッシュ "/" で区切られ、全角ブランク（△=U+3000）および
 * 半角ブランク（▲=U+0020）、半角ハイフン "-" を null/パディング値として使用する。
 *
 * 複数 QR（QR2 と QR3）を同時に読んだ場合は、呼び出し側で改行区切りに連結して
 * 一度に渡せる。parseShakenshoCode は各セクションを個別に解析しマージする。
 *
 * @see https://www.denshishakensho-portal.mlit.go.jp/
 */
import sharp from "sharp";
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  NotFoundException,
} from "@zxing/library";
import type { ShakenshoData } from "./shakensho";

// sharp.Region は名前空間メンバーで top-level named export ではないため別名定義する。
// (sharp 型バンプ後に main で顕在化していた tsc エラーを修正。挙動変更なし。)
type Region = sharp.Region;

// ─────────────────────────────────────────────
// 画像デコード
// ─────────────────────────────────────────────

function buildHints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.AZTEC,
    BarcodeFormat.PDF_417,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

/** 指定領域（または画像全体）から単一の 2D コードをデコード */
async function tryDecodeRegion(imageBuffer: Buffer, region?: Region): Promise<string | null> {
  try {
    let pipeline = sharp(imageBuffer).rotate(); // EXIF 回転を先に反映
    if (region) pipeline = pipeline.extract(region);
    const { data, info } = await pipeline.grayscale().raw().toBuffer({ resolveWithObject: true });

    const luminances = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    const source = new RGBLuminanceSource(luminances, info.width, info.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));

    const reader = new MultiFormatReader();
    reader.setHints(buildHints());
    return reader.decode(bitmap).getText();
  } catch (err) {
    if (err instanceof NotFoundException) return null;
    return null;
  }
}

/**
 * 画像から**全ての** 2D コードをデコードして配列で返す。
 *
 * 電子車検証は二次元コード2（QR2）と二次元コード3（QR3）が同一画像に並んで
 * 印字されるため、両方を読まないと情報が欠落する。`@zxing/library` v0.21 の
 * 公開 API には複数検出リーダが無いので、画像を「全体 → 左右半分 → 上下半分」と
 * 複数領域に分けて個別デコードし、結果を重複除去して返す。1 件も見つからなければ
 * 空配列。
 */
export async function decode2DCodes(imageBuffer: Buffer): Promise<string[]> {
  const results = new Set<string>();

  // 1. 画像全体
  const whole = await tryDecodeRegion(imageBuffer);
  if (whole) results.add(whole);

  // 2. 既に 2 件以上検出できていれば（QR2+QR3 の想定）これ以上のリージョン試行は不要
  if (results.size >= 2) return Array.from(results);

  // 3. 画像サイズを取得して左右・上下の半分ずつ試す
  try {
    const meta = await sharp(imageBuffer).rotate().metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w >= 40 && h >= 40) {
      const halfW = Math.floor(w / 2);
      const halfH = Math.floor(h / 2);
      const regions: Region[] = [
        { left: 0, top: 0, width: halfW, height: h }, // 左半分
        { left: halfW, top: 0, width: w - halfW, height: h }, // 右半分
        { left: 0, top: 0, width: w, height: halfH }, // 上半分
        { left: 0, top: halfH, width: w, height: h - halfH }, // 下半分
      ];
      for (const region of regions) {
        const r = await tryDecodeRegion(imageBuffer, region);
        if (r) results.add(r);
        if (results.size >= 2) break; // QR2+QR3 揃った時点で打ち切り
      }
    }
  } catch (err) {
    console.warn("[shakensho-qr] region metadata failed:", err);
  }

  return Array.from(results);
}

/**
 * 画像から単一の 2D コードをデコード。複数コードが写っている場合は
 * `decode2DCodes` を使うこと。
 *
 * @deprecated 電子車検証のユースケースでは `decode2DCodes` を使う。
 */
export async function decode2DCode(imageBuffer: Buffer): Promise<string | null> {
  return tryDecodeRegion(imageBuffer);
}

// ─────────────────────────────────────────────
// 定数テーブル
// ─────────────────────────────────────────────

const FW_SPACE = "　"; // 全角ブランク △

/** 燃料の種類コード → 表示名 */
const FUEL_CODES: Record<string, string> = {
  "01": "ガソリン",
  "02": "軽油",
  "03": "LPG",
  "04": "灯油",
  "05": "電気",
  "06": "ガソリン・LPG",
  "07": "ガソリン・灯油",
  "08": "メタノール",
  "09": "CNG",
  "11": "LNG",
  "12": "ANG",
  "13": "圧縮水素",
  "14": "ガソリン・電気",
  "15": "LPG・電気",
  "16": "軽油・電気",
  "99": "その他",
};

/** 駆動方式コード → 表示名 */
const DRIVE_TYPES: Record<string, string> = {
  "1": "全輪駆動",
  "2": "全輪駆動以外",
  "0": "設定値無し",
  "-": "一般車",
};

// ─────────────────────────────────────────────
// ヘルパー: パディング処理・null 判定
// ─────────────────────────────────────────────

/** "-" / 空白のみの null プレースホルダを判定（"-▲▲", "-　", "   " 等） */
function isNullPlaceholder(raw: string | undefined): boolean {
  if (!raw) return true;
  const cleaned = raw.replace(new RegExp(FW_SPACE, "g"), "").trim();
  return cleaned === "" || /^-+$/.test(cleaned);
}

/** 全角・半角ブランクを除去してトリム */
function stripPadding(raw: string): string {
  return raw.replace(new RegExp(FW_SPACE, "g"), "").trim();
}

/**
 * YYMMDD → YYYY-MM-DD（"999999" / "-" は undefined）
 * 2桁年は 50 未満なら 2000 年代、それ以外は 1900 年代。
 */
function parseDate6(s: string | undefined): string | undefined {
  if (!s || s === "999999" || isNullPlaceholder(s)) return undefined;
  const m = s.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (!m) return undefined;
  const yy = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const dd = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined;
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  // 実在日か round-trip で確認（0230 / 0431 等、日レンジ内でも存在しない日を弾く）。
  const d = new Date(year, mm - 1, dd);
  if (d.getFullYear() !== year || d.getMonth() !== mm - 1 || d.getDate() !== dd) return undefined;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** YYMM → YYYY-MM（"9999" / "-" は undefined） */
function parseYearMonth4(s: string | undefined): string | undefined {
  if (!s || s === "9999" || isNullPlaceholder(s)) return undefined;
  const m = s.match(/^(\d{2})(\d{2})$/);
  if (!m) return undefined;
  const yy = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (mm < 1 || mm > 12) return undefined;
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return `${year}-${String(mm).padStart(2, "0")}`;
}

/**
 * 12 全角文字の登録番号を表示用文字列に整形する。
 * 構造: 標板文字（4桁）＋ 分類番号（3桁）＋ カナ文字（1桁）＋ 一連番号（4桁）
 *
 * @example formatPlateDisplay("尾張小牧５００や１０００") === "尾張小牧 ５００ や １０００"
 * @example formatPlateDisplay("品川　　５５　あ　　９９") === "品川 ５５ あ ９９"
 */
function formatPlateDisplay(raw: string | undefined): string | undefined {
  if (!raw || isNullPlaceholder(raw)) return undefined;
  if (raw.length < 12) return undefined;
  const area = stripPadding(raw.slice(0, 4));
  const klass = stripPadding(raw.slice(4, 7));
  const kana = stripPadding(raw.slice(7, 8));
  const serial = stripPadding(raw.slice(8, 12));
  const parts = [area, klass, kana, serial].filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** 車台番号 / 型式 / 原動機型式の共通正規化（null プレースホルダと空白を除去） */
function parseIdentifier(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || isNullPlaceholder(trimmed)) return undefined;
  return trimmed;
}

/** 軸重（単位 10kg）→ kg */
function parseAxleWeight(raw: string | undefined): number | undefined {
  if (!raw || isNullPlaceholder(raw)) return undefined;
  const n = parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n * 10;
}

function parseFuelType(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return FUEL_CODES[code.trim()];
}

function parseDriveType(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return DRIVE_TYPES[code.trim()];
}

// ─────────────────────────────────────────────
// QR2 パーサ（6 フィールド）
//   1. バージョン情報 (1)
//   2. 自動車登録番号・車両番号 (全角 12)
//   3. 標板の枚数・大きさ・希望番号の識別 (1)
//   4. 車台番号 (可変 23)
//   5. 原動機型式 (可変 24)
//   6. 帳票種別 (1)
// ─────────────────────────────────────────────

function parseQR2Fields(fields: string[]): Partial<ShakenshoData> {
  const [, plate, , vin, engineModel] = fields;

  const data: Partial<ShakenshoData> = {};
  const plateDisplay = formatPlateDisplay(plate);
  if (plateDisplay) data.plate_display = plateDisplay;
  const vinVal = parseIdentifier(vin);
  if (vinVal) data.vin = vinVal;
  const engineVal = parseIdentifier(engineModel);
  if (engineVal) data.engine_model = engineVal;
  return data;
}

// ─────────────────────────────────────────────
// QR3 パーサ（21 フィールド）
//   1. バージョン情報 (1)
//   2. 車台番号打刻位置 (3)
//   3. 型式指定番号・類別区分番号 (可変 10)
//   4. 有効期間満了日（電子車検証券面） (6) — 常に "999999"
//   5. 有効期間満了日（閲覧アプリ表示） (6) — YYMMDD
//   6. 有効期間満了日（記録事項帳票） (6) — YYMMDD
//   7. 初度登録年月 (4) — YYMM
//   8. 型式 (可変 17)
//   9-12. 軸重（前前/前後/後前/後後） (各 4) — 10kg 単位
//   13. 騒音規制 (2)
//   14. 近接排気騒音規制値 (3)
//   15. 駆動方式 (1)
//   16. オパシメータ測定車 (1)
//   17. NOx・PM 測定モード (1)
//   18. NOx 値 (4)
//   19. PM 値 (5)
//   20. 保安基準適用年月日 (6) — YYMMDD
//   21. 燃料の種類コード (2)
// ─────────────────────────────────────────────

function parseQR3Fields(fields: string[]): Partial<ShakenshoData> {
  const data: Partial<ShakenshoData> = {};

  const chassisPunchPos = fields[1];
  if (chassisPunchPos && !isNullPlaceholder(chassisPunchPos)) {
    data.chassis_punch_position = chassisPunchPos.trim();
  }

  const modelCode = fields[2];
  if (modelCode && !isNullPlaceholder(modelCode)) {
    data.model_code = modelCode.trim();
  }

  // 有効期間満了日: 閲覧アプリ表示用 → 記録事項帳票用 の順にフォールバック。
  // フィールド 4（電子車検証券面）は常に "999999" なので参照しない。
  const expiry = parseDate6(fields[4]) ?? parseDate6(fields[5]);
  if (expiry) data.expiry_date = expiry;

  const reg = parseYearMonth4(fields[6]);
  if (reg) data.first_registration = reg;

  const modelVal = parseIdentifier(fields[7]);
  if (modelVal) data.model = modelVal;

  const axles = {
    front_front: parseAxleWeight(fields[8]),
    front_rear: parseAxleWeight(fields[9]),
    rear_front: parseAxleWeight(fields[10]),
    rear_rear: parseAxleWeight(fields[11]),
  };
  if (Object.values(axles).some((v) => v !== undefined)) {
    data.axle_weights_kg = axles;
  }

  const drive = parseDriveType(fields[14]);
  if (drive) data.drive_type = drive;

  const safety = parseDate6(fields[19]);
  if (safety) data.safety_standard_date = safety;

  const fuel = parseFuelType(fields[20]);
  if (fuel) data.fuel_type = fuel;

  return data;
}

// ─────────────────────────────────────────────
// メインエントリ: QR2 / QR3 を自動判別してパース
// ─────────────────────────────────────────────

/**
 * 二次元コードのデコード済みテキストを `ShakenshoData` にパースする。
 *
 * 複数コード（QR2 + QR3）を読んだ場合は改行区切りで渡すと両方マージされる。
 * 未知フォーマットは null を返し、呼び出し側は Claude Vision OCR にフォールバックする。
 */
export function parseShakenshoCode(raw: string): Partial<ShakenshoData> | null {
  if (!raw || raw.length < 4) return null;

  const sections = raw.split(/\r?\n/).filter((s) => s.trim().length > 0);
  const results: Partial<ShakenshoData>[] = [];

  for (const section of sections) {
    const fields = section.split("/");
    // バージョン情報は半角数字 1 桁
    if (!fields[0] || !/^\d$/.test(fields[0])) continue;

    if (fields.length === 6) {
      results.push(parseQR2Fields(fields));
    } else if (fields.length === 21) {
      results.push(parseQR3Fields(fields));
    }
  }

  if (results.length === 0) return null;

  // 複数セクションを 1 つにマージ（後勝ち）
  const merged: Partial<ShakenshoData> = {};
  for (const r of results) Object.assign(merged, r);
  return Object.keys(merged).length > 0 ? merged : null;
}
