/**
 * datetime-local（`<input type="datetime-local">`）と UTC ISO の相互変換。
 *
 * datetime-local はオフセットを持たない壁時計文字列（例 "2026-07-30T14:00"）を生成する。
 * これを `new Date(x).toISOString()` にそのまま渡すと、実行環境の TZ で解釈される。
 * Vercel ランタイムは UTC のため、JST 管理者が入力した 14:00 が「14:00 UTC」＝ JST 23:00 として
 * 保存され、予約公開が 9 時間ずれる。Ledra は国内向けで全店 JST 前提なので、naive な入力は
 * 常に JST (UTC+9, DST なし) として扱う。
 *
 * ponytail: 全店 JST 固定。店舗別タイムゾーン対応は海外展開時に店舗 tz を持たせて拡張する。
 */

const JST_OFFSET = "+09:00";

/** 既に Z / ±HH:MM のオフセットを持つか。 */
function hasTimezone(s: string): boolean {
  return /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
}

/**
 * datetime-local の naive 文字列（JST 壁時計）を UTC ISO 文字列へ変換する。
 * 既にオフセットを含む文字列はそのまま解釈する。空文字は null を返す。
 */
export function jstLocalInputToUtcIso(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (s.length === 0) return null;
  const d = new Date(hasTimezone(s) ? s : `${s}${JST_OFFSET}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * UTC ISO 文字列を datetime-local 入力用の JST 壁時計文字列 "YYYY-MM-DDTHH:mm" へ変換する。
 * ブラウザ TZ に依存せず常に JST で表示するため、サーバ側 {@link jstLocalInputToUtcIso} と対称になる。
 */
export function utcIsoToJstLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // JST へシフトしてから UTC 各値を読む（= JST 壁時計）。
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())}T${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}`;
}
