/**
 * Odometer reading (km) attached to a certificate.
 *
 * One definition shared by the client form and the server action so the two
 * cannot disagree about what counts as a valid entry. The DB trigger
 * `fn_sync_mileage_from_certificate` drops anything `null` or `<= 0` when
 * copying `certificates.maintenance_json->>'mileage'` into
 * `vehicle_mileage_logs`, so "valid here" has to mean "the trigger will keep
 * it" — otherwise the form would accept a value that silently never lands.
 */

/** Upper bound. Beyond this a reading is a typo (extra digit), not a car. */
export const MAX_MILEAGE_KM = 2_000_000;

/**
 * Parse a raw form value into a storable odometer reading.
 * Returns null for anything the trigger would discard or a human would call a
 * typo: blank, non-numeric, zero, negative, fractional, or absurdly large.
 */
export function parseMileageKm(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Number() over parseInt: parseInt("35000km") returns 35000, which would let
  // a fat-fingered unit through as if it were clean input.
  const n = Number(s);
  if (!Number.isInteger(n)) return null;
  if (n <= 0 || n > MAX_MILEAGE_KM) return null;
  return n;
}

/** 発行 (draft→active) を走行距離不足でブロックしたときのメッセージ。 */
export const CERTIFICATE_MILEAGE_REQUIRED_MESSAGE =
  "施工証明書の発行には走行距離（km）が必要です。メーター写真から読み取るか手入力してから発行してください。";

/**
 * 証明書の `maintenance_json` から確定済みの走行距離を取り出す。
 *
 * 発行のチョークポイント (status / activate-by-key) で使う。作成経路ごとに
 * 必須化すると AI 自動起票・外部 API・取り込みのような「人が入力画面を通らない」
 * 経路が漏れるため、写真必須ルールと同じく **発行の瞬間** に一度だけ強制する。
 * OCR で自動入力した値もここを通る前に人が発行操作をするので、
 * 「読み取りは自動・最終確認は人間」が成立する。
 */
export function certificateMileageKm(maintenanceJson: unknown): number | null {
  if (!maintenanceJson || typeof maintenanceJson !== "object" || Array.isArray(maintenanceJson)) return null;
  return parseMileageKm((maintenanceJson as Record<string, unknown>).mileage);
}

/** 編集時の走行距離マージ結果。`error` があれば 400 で返す。 */
export type MileageEditResult = { ok: true; maintenanceJson: Record<string, unknown> } | { ok: false; error: string };

/**
 * 編集 (`PUT /api/certificates/edit`) で走行距離を「入れられるが、消せない」ようにマージする。
 *
 * `maintenance_json` は丸ごと差し替えなので、走行距離を持たない payload を投げると
 * 既存の値が黙って消える。消えても画面にはエラーが出ず、車両パスポートの走行距離履歴
 * だけが欠ける（発行時に必須化した意味が編集で失われる）。
 * 一方この経路は**遡及入力の手段そのもの**でもある。DBトリガー
 * `trg_sync_mileage_from_certificate` は `UPDATE OF maintenance_json` でも発火するので、
 * 過去の証明書に走行距離を入れれば `vehicle_mileage_logs` に積まれる。
 * そこで「入力・訂正は許可、削除は不可」にする。
 */
export function mergeMileageOnEdit(existingMaintenanceJson: unknown, incomingRaw: unknown): MileageEditResult {
  if (typeof incomingRaw !== "object" || incomingRaw === null || Array.isArray(incomingRaw)) {
    return { ok: false, error: "maintenance_json の形式が不正です。" };
  }
  const incoming = incomingRaw as Record<string, unknown>;
  const incomingMileage = parseMileageKm(incoming.mileage);

  if (incoming.mileage !== undefined && incoming.mileage !== null && incomingMileage === null) {
    // 値は来ているが不正。黙って捨てると「保存できたのに履歴に出ない」になる。
    return { ok: false, error: "走行距離（km）は1以上の整数で入力してください。" };
  }
  if (incomingMileage !== null) {
    return { ok: true, maintenanceJson: { ...incoming, mileage: incomingMileage } };
  }
  // 走行距離を持たない payload で既存値を消させない
  const existingMileage = certificateMileageKm(existingMaintenanceJson);
  if (existingMileage !== null) {
    return { ok: true, maintenanceJson: { ...incoming, mileage: existingMileage } };
  }
  return { ok: true, maintenanceJson: incoming };
}
