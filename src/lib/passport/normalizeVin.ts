/**
 * Normalize a raw VIN / vehicle number for cross-tenant comparison.
 *
 * Rules (must match `vin_normalize()` in migration 20260825000000):
 *  1. NFKC normalize → full-width ASCII chars become half-width
 *  2. Uppercase
 *  3. Strip whitespace and hyphens
 *
 * `20260424000000` はこのコメントが参照していたが**存在しないファイル**だった。
 * 実体は 20260424000004（列の追加と一度きりのバックフィル）と、継続的に
 * 同期させる 20260825000000（トリガー）。
 *
 * SQL 側との差は1点だけで、**意図的**である: 空入力に対し SQL は NULL を、
 * ここは "" を返す。保存側で "" を入れると、車体番号が空の車両どうしが
 * 同じキーで「一致」してしまう。照合側の "" は何にも一致しないので害が無い。
 * JS の \s は U+FEFF を含むため BOM の扱いは一致する（SQL 側は PostgreSQL の
 * \s が U+FEFF を拾わないので明示列挙している）。
 */
export function normalizeVin(raw: string): string {
  return raw
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}
