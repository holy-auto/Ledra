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

/** UTC ISO（または "YYYY-MM-DD" 等の日付文字列）を JST の暦カレンダー値へ分解する。
 * 表示用。`new Date().getHours()` 等は実行環境ローカル TZ（Vercel は UTC）で動くため、
 * サーバレンダリングだと JST 入力が 9 時間ずれて表示される。これを避けるため常に JST で読む。 */
export function jstParts(
  iso: string | null | undefined,
): { y: number; m: number; d: number; hh: number; mm: number } | null {
  if (!iso) return null;
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return null;
  // JST へシフトしてから UTC 各値を読む（= JST 壁時計）。
  const jst = new Date(base.getTime() + 9 * 60 * 60 * 1000);
  return {
    y: jst.getUTCFullYear(),
    m: jst.getUTCMonth() + 1,
    d: jst.getUTCDate(),
    hh: jst.getUTCHours(),
    mm: jst.getUTCMinutes(),
  };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * UTC ISO 文字列を datetime-local 入力用の JST 壁時計文字列 "YYYY-MM-DDTHH:mm" へ変換する。
 * ブラウザ TZ に依存せず常に JST で表示するため、サーバ側 {@link jstLocalInputToUtcIso} と対称になる。
 */
export function utcIsoToJstLocalInput(iso: string | null | undefined): string {
  const p = jstParts(iso);
  if (!p) return "";
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}T${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** 表示用 "YYYY/MM/DD HH:mm"（JST）。iso が無効なら fallback（既定 "—"）。 */
export function formatJstDateTime(iso: string | null | undefined, fallback = "—"): string {
  const p = jstParts(iso);
  if (!p) return fallback;
  return `${p.y}/${pad2(p.m)}/${pad2(p.d)} ${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** 表示用 "YYYY年M月D日 HH:mm"（JST）。iso が無効なら fallback（既定 ""）。 */
export function formatJstDateTimeJa(iso: string | null | undefined, fallback = ""): string {
  const p = jstParts(iso);
  if (!p) return fallback;
  return `${p.y}年${p.m}月${p.d}日 ${pad2(p.hh)}:${pad2(p.mm)}`;
}

/** 表示用 "YYYY年M月D日"（JST・日付のみ）。iso が無効なら fallback（既定 ""）。 */
export function formatJstDateJa(iso: string | null | undefined, fallback = ""): string {
  const p = jstParts(iso);
  if (!p) return fallback;
  return `${p.y}年${p.m}月${p.d}日`;
}
