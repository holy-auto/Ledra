/**
 * 証明書の膜厚記録（content_preset_json.film_thickness）を表示用に読み出す。
 * 作成画面 FilmThicknessSection が保存する形: { location, before_um, after_um, notes }[]。
 * PDF と公開ページで同じ読み方をするための純関数。
 */
export type FilmThicknessRow = {
  location: string;
  before_um: number | null;
  after_um: number | null;
  notes: string;
};

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function parseFilmThickness(preset: unknown): FilmThicknessRow[] {
  const raw = preset && typeof preset === "object" ? (preset as Record<string, unknown>).film_thickness : null;
  if (!Array.isArray(raw)) return [];
  return (
    raw
      .map((r) => {
        const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
        return {
          location: typeof o.location === "string" ? o.location.trim() : "",
          before_um: toNum(o.before_um),
          after_um: toNum(o.after_um),
          notes: typeof o.notes === "string" ? o.notes.trim() : "",
        };
      })
      // 部位だけ選んで値を入れていない行も保存されるので、測定値のある行だけ出す。
      .filter((r) => r.before_um != null || r.after_um != null)
  );
}

/** 「施工前 80 / 施工後 95 µm」。PDF の埋め込みフォントに「→」が無いので矢印は使わない。 */
export function formatThickness(r: FilmThicknessRow): string {
  const b = r.before_um != null ? `${r.before_um}` : null;
  const a = r.after_um != null ? `${r.after_um}` : null;
  if (b && a) return `施工前 ${b} / 施工後 ${a} µm`;
  if (a) return `${a} µm（施工後）`;
  if (b) return `${b} µm（施工前）`;
  return "-";
}
