/**
 * 傷・損傷位置マップ（車両展開図へのタップ配置）のデータモデルと純ロジック。
 *
 * 実写真注釈 (imageMarkup) の「正規化座標 + マーカー配列」設計を、車両図の viewBox
 * 空間版として踏襲する。座標は 0..1 の正規化値で保存し、表示解像度に依存しない。
 * 保存先は certificates.damage_map_json（body_repair_json 等と同じ hidden input パターン）。
 *
 * DOM を触らない純関数のみ（座標算出・検証・直列化）。単体テストで担保する。
 */

export const DAMAGE_MAP_VERSION = 1 as const;

export const DAMAGE_KINDS = [
  { key: "scratch", label: "傷" },
  { key: "dent", label: "凹み" },
  { key: "paint", label: "塗装剥げ" },
  { key: "rust", label: "サビ" },
  { key: "other", label: "その他" },
] as const;

export type DamageKind = (typeof DAMAGE_KINDS)[number]["key"];

const KIND_SET = new Set<string>(DAMAGE_KINDS.map((k) => k.key));

export interface DamageMarker {
  id: string;
  /** 0..1 正規化 X（車両図の左→右）。 */
  x: number;
  /** 0..1 正規化 Y（車両図の前→後）。 */
  y: number;
  kind: DamageKind;
  note: string;
}

export interface DamageMap {
  version: typeof DAMAGE_MAP_VERSION;
  markers: DamageMarker[];
}

export function emptyDamageMap(): DamageMap {
  return { version: DAMAGE_MAP_VERSION, markers: [] };
}

/** 0..1 にクランプ（NaN は 0）。 */
export function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * SVG のクリック位置（CSS ピクセル）を 0..1 正規化座標へ変換する純関数。
 * rect は getBoundingClientRect の {left, top, width, height}。
 */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;
  return { x: clampUnit(x), y: clampUnit(y) };
}

function isKind(v: unknown): v is DamageKind {
  return typeof v === "string" && KIND_SET.has(v);
}

/** 任意入力を DamageMarker に正規化。不正なら null。 */
function coerceMarker(input: unknown): DamageMarker | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const x = Number(o.x);
  const y = Number(o.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id : `m${Math.round(x * 1e6)}-${Math.round(y * 1e6)}`;
  return {
    id,
    x: clampUnit(x),
    y: clampUnit(y),
    kind: isKind(o.kind) ? o.kind : "other",
    note: typeof o.note === "string" ? o.note.trim().slice(0, 200) : "",
  };
}

/**
 * 保存された JSON（文字列 or オブジェクト）を DamageMap に検証・正規化する。
 * 不正なマーカーは落とす。マーカーが 1 件も無ければ null を返す（空は保存しない判断に使える）。
 */
export function parseDamageMap(value: unknown): DamageMap | null {
  let obj: unknown = value;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    try {
      obj = JSON.parse(s);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const rawMarkers = (obj as Record<string, unknown>).markers;
  if (!Array.isArray(rawMarkers)) return null;
  const markers = rawMarkers.map(coerceMarker).filter((m): m is DamageMarker => m !== null);
  if (markers.length === 0) return null;
  return { version: DAMAGE_MAP_VERSION, markers };
}

/** DamageMap を hidden input 用の JSON 文字列にする。マーカー 0 件なら空文字（保存しない）。 */
export function serializeDamageMap(map: DamageMap): string {
  const cleaned = map.markers.map(coerceMarker).filter((m): m is DamageMarker => m !== null);
  if (cleaned.length === 0) return "";
  return JSON.stringify({ version: DAMAGE_MAP_VERSION, markers: cleaned });
}
