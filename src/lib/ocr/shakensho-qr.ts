/**
 * 車検証 2Dコード デコード & パース
 *
 * 電子車検証（2023年1月〜）には IC チップとは別に、紙面に 2D コード（QR / DataMatrix 等）
 * が印字されており、一部の基本情報が取得できる。カメラ撮影で読み取れれば OCR より高精度。
 *
 * ⚠️ 国交省の 2D コード仕様書は事業者登録後に入手可能。現時点の parser は想定される
 * 汎用フォーマット（JSON / 区切り文字列）に対する暫定実装で、正式仕様入手後に差し替える想定。
 * 未知フォーマットの場合は null を返して Claude Vision OCR へフォールバックさせる。
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

/**
 * 画像から 2D コード（QR / DataMatrix / Aztec / PDF417）をデコード。
 * 見つからなければ null。
 */
export async function decode2DCode(imageBuffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(imageBuffer)
      .rotate() // EXIF に従って自動回転
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminances = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    const source = new RGBLuminanceSource(luminances, info.width, info.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));

    const reader = new MultiFormatReader();
    const hints = new Map<DecodeHintType, unknown>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.AZTEC,
      BarcodeFormat.PDF_417,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    reader.setHints(hints);

    const result = reader.decode(bitmap);
    return result.getText();
  } catch (err) {
    if (err instanceof NotFoundException) return null;
    console.warn("[shakensho-qr] decode failed:", err);
    return null;
  }
}

/**
 * デコード済み文字列が「車検証の 2D コードっぽいか」を判定するシグナル。
 * 誤検出を避けるため、3 つ以上該当した場合のみ true。
 */
function looksLikeShakenshoCode(raw: string): boolean {
  const signals = [
    /車台番号|chassis|vin/i,
    /型式|model/i,
    /自動車登録番号|registration/i,
    /初度登録|first_reg/i,
    /有効期間|expiry|valid/i,
    /車名|maker/i,
    /長さ|width|height|length/i,
    /[A-Z0-9]{3,}-[A-Z0-9]{4,}/, // VIN っぽいパターン
  ];
  const hits = signals.filter((re) => re.test(raw)).length;
  return hits >= 3;
}

/** JSON を試す */
function tryParseJson(raw: string): Partial<ShakenshoData> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    const data: Partial<ShakenshoData> = {};
    if (typeof obj.maker === "string") data.maker = obj.maker;
    if (typeof obj.model === "string") data.model = obj.model;
    if (typeof obj.vin === "string") data.vin = obj.vin;
    if (typeof obj.first_registration === "string") data.first_registration = obj.first_registration;
    if (typeof obj.plate_display === "string") data.plate_display = obj.plate_display;
    if (typeof obj.length_mm === "number") data.length_mm = obj.length_mm;
    if (typeof obj.width_mm === "number") data.width_mm = obj.width_mm;
    if (typeof obj.height_mm === "number") data.height_mm = obj.height_mm;
    if (typeof obj.weight_kg === "number") data.weight_kg = obj.weight_kg;
    if (typeof obj.displacement_cc === "number") data.displacement_cc = obj.displacement_cc;
    return Object.keys(data).length > 0 ? data : null;
  } catch {
    return null;
  }
}

/** key=value の行区切りフォーマットを試す */
function tryParseKeyValue(raw: string): Partial<ShakenshoData> | null {
  if (!raw.includes("=") && !raw.includes(":")) return null;
  const map = new Map<string, string>();
  for (const line of raw.split(/[\r\n;|]+/)) {
    const m = line.match(/^\s*([^=:]+)\s*[=:]\s*(.+)\s*$/);
    if (m) map.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  if (map.size === 0) return null;

  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = map.get(k.toLowerCase());
      if (v) return v;
    }
    return undefined;
  };
  const getNum = (...keys: string[]): number | undefined => {
    const v = get(...keys);
    if (!v) return undefined;
    const n = parseInt(v.replace(/[,\s]/g, ""), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const data: Partial<ShakenshoData> = {};
  const maker = get("maker", "車名", "メーカー");
  if (maker) data.maker = maker;
  const model = get("model", "型式");
  if (model) data.model = model;
  const vin = get("vin", "車台番号", "chassis");
  if (vin) data.vin = vin;
  const firstReg = get("first_registration", "初度登録年月", "初度登録");
  if (firstReg) data.first_registration = firstReg;
  const plate = get("plate_display", "自動車登録番号", "車両番号", "登録番号");
  if (plate) data.plate_display = plate;
  const len = getNum("length_mm", "長さ");
  if (len) data.length_mm = len;
  const wid = getNum("width_mm", "幅");
  if (wid) data.width_mm = wid;
  const hei = getNum("height_mm", "高さ");
  if (hei) data.height_mm = hei;
  const wt = getNum("weight_kg", "車両重量");
  if (wt) data.weight_kg = wt;
  const disp = getNum("displacement_cc", "総排気量", "排気量");
  if (disp) data.displacement_cc = disp;

  return Object.keys(data).length > 0 ? data : null;
}

/**
 * デコード済みテキストを車検証データにパースする。
 * 未知フォーマットの場合は null を返し、呼び出し側は OCR にフォールバックする。
 *
 * 国交省仕様書入手後、ここに本仕様のパーサを追加する。
 */
export function parseShakenshoCode(raw: string): Partial<ShakenshoData> | null {
  if (!raw || raw.length < 4) return null;

  // 明確なフォーマット優先
  const json = tryParseJson(raw);
  if (json) return json;

  const kv = tryParseKeyValue(raw);
  if (kv) return kv;

  // 上記にマッチしない生の文字列は、車検証らしきシグナルがある時のみ
  // デバッグ用に raw を返す（将来の仕様追加時の材料として）
  if (looksLikeShakenshoCode(raw)) {
    console.info("[shakensho-qr] unknown format but looks like shakensho:", raw.slice(0, 200));
  }

  return null;
}
