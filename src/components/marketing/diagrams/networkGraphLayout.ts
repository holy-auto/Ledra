export type Point = { x: number; y: number };
export type SatelliteEntry = { label: string; count: number };
export type Satellite = SatelliteEntry & { point: Point };

export function angleToPoint(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** count 個の点を、中心 (cx,cy) から半径 r で startDeg〜endDeg の弧上に等間隔配置 */
export function fanPositions(
  cx: number,
  cy: number,
  r: number,
  count: number,
  startDeg: number,
  endDeg: number,
): Point[] {
  if (count <= 0) return [];
  if (count === 1) return [angleToPoint(cx, cy, r, (startDeg + endDeg) / 2)];
  const step = (endDeg - startDeg) / (count - 1);
  return Array.from({ length: count }, (_, i) => angleToPoint(cx, cy, r, startDeg + step * i));
}

/** maxSatellites 件までそのまま出し、残りは合計件数を背負った "+N件" ノードに畳む */
export function satelliteList(entries: SatelliteEntry[], maxSatellites: number): SatelliteEntry[] {
  if (entries.length <= maxSatellites) return entries;
  const shown = entries.slice(0, maxSatellites - 1);
  const restCount = entries.slice(maxSatellites - 1).reduce((s, e) => s + e.count, 0);
  const restN = entries.length - (maxSatellites - 1);
  return [...shown, { label: `+${restN}件`, count: restCount }];
}

/**
 * entries を maxSatellites 件に畳んだうえで、その畳んだ後の件数ぶんだけ扇状に
 * 配置する。畳む前後で件数が変わり得るため、必ず satelliteList → fanPositions
 * の順で同じ長さから作る（別々に Math.min するとズレる）。
 */
export function buildSatellites(
  entries: SatelliteEntry[],
  hub: Point,
  radius: number,
  startDeg: number,
  endDeg: number,
  maxSatellites: number,
): Satellite[] {
  const capped = satelliteList(entries, maxSatellites);
  const points = fanPositions(hub.x, hub.y, radius, capped.length, startDeg, endDeg);
  return capped.map((e, i) => ({ ...e, point: points[i] }));
}
