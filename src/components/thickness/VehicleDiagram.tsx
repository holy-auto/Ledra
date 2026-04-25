import type { CSSProperties } from "react";

/**
 * 車体展開図（NexPTG 膜厚測定の可視化）
 *
 * 上面視点で車体中央列に HOOD / ROOF / TRUNK を、左右列に 5 つずつの
 * 側面パネル（フェンダー・ドア・ピラー）を配置した「exploded」レイアウト。
 * 各パネルは判定最大値（1-5）で色分けされ、ホバーで詳細をツールチップ表示する。
 */

const SECTION_JA: Record<string, string> = {
  LEFT_FRONT_FENDER: "左フロントフェンダー",
  LEFT_FRONT_DOOR: "左フロントドア",
  LEFT_REAR_DOOR: "左リアドア",
  LEFT_PILLAR: "左ピラー",
  LEFT_REAR_FENDER: "左リアフェンダー",
  RIGHT_FRONT_FENDER: "右フロントフェンダー",
  RIGHT_FRONT_DOOR: "右フロントドア",
  RIGHT_REAR_DOOR: "右リアドア",
  RIGHT_PILLAR: "右ピラー",
  RIGHT_REAR_FENDER: "右リアフェンダー",
  HOOD: "ボンネット",
  ROOF: "ルーフ",
  TRUNK: "トランク",
  LEFT_SIDE: "左側内装",
  RIGHT_SIDE: "右側内装",
  ENGINE_COMPARTMENT: "エンジンルーム",
  TRUNK_INSIDE: "トランク内装",
};

const SHORT_LABEL: Record<string, string> = {
  LEFT_FRONT_FENDER: "左Fフェンダー",
  LEFT_FRONT_DOOR: "左Fドア",
  LEFT_REAR_DOOR: "左Rドア",
  LEFT_PILLAR: "左ピラー",
  LEFT_REAR_FENDER: "左Rフェンダー",
  RIGHT_FRONT_FENDER: "右Fフェンダー",
  RIGHT_FRONT_DOOR: "右Fドア",
  RIGHT_REAR_DOOR: "右Rドア",
  RIGHT_PILLAR: "右ピラー",
  RIGHT_REAR_FENDER: "右Rフェンダー",
  HOOD: "ボンネット",
  ROOF: "ルーフ",
  TRUNK: "トランク",
  LEFT_SIDE: "左側",
  RIGHT_SIDE: "右側",
  ENGINE_COMPARTMENT: "エンジンルーム",
  TRUNK_INSIDE: "トランク内装",
};

export type PanelInfo = {
  count: number;
  maxValue: number | null;
  avgValue: number | null;
  maxInterpretation: number | null;
  materials: string[];
};

/** 判定値ごとの色（CSS変数を直接参照する） */
function paletteFor(maxInterp: number | null): { fill: string; stroke: string; text: string; badge: string } {
  if (maxInterp === null || maxInterp === undefined) {
    return {
      fill: "var(--bg-inset)",
      stroke: "var(--border-default)",
      text: "var(--text-muted)",
      badge: "transparent",
    };
  }
  if (maxInterp <= 2) {
    return {
      fill: "var(--accent-emerald-dim)",
      stroke: "var(--accent-emerald)",
      text: "var(--accent-emerald-text)",
      badge: "var(--accent-emerald)",
    };
  }
  if (maxInterp <= 4) {
    return {
      fill: "var(--accent-amber-dim)",
      stroke: "var(--accent-amber)",
      text: "var(--accent-amber-text)",
      badge: "var(--accent-amber)",
    };
  }
  return {
    fill: "var(--accent-red-dim)",
    stroke: "var(--accent-red)",
    text: "var(--accent-red-text)",
    badge: "var(--accent-red)",
  };
}

type PanelRect = {
  section: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** SVG path for non-rectangular panels（HOOD/TRUNKの先端カーブ用）。指定時は rect の代わりに path を描画する */
  pathD?: string;
  /** 短縮ラベルを使うか */
  short?: boolean;
};

// ==================== 外装レイアウト ====================
// viewBox 800 x 560, sedan top-view exploded
const EXTERIOR_PANELS: PanelRect[] = [
  // 中央列: HOOD（先端ラウンド）, ROOF, TRUNK（後端ラウンド）
  { section: "HOOD", x: 280, y: 60, w: 240, h: 110, pathD: "M 280 110 Q 280 60 360 60 L 440 60 Q 520 60 520 110 L 520 170 L 280 170 Z" },
  { section: "ROOF", x: 280, y: 180, w: 240, h: 200 },
  { section: "TRUNK", x: 280, y: 390, w: 240, h: 110, pathD: "M 280 390 L 520 390 L 520 450 Q 520 500 440 500 L 360 500 Q 280 500 280 450 Z" },

  // 左列（front→rear）
  { section: "LEFT_FRONT_FENDER", x: 60, y: 60, w: 200, h: 80, short: true, pathD: "M 100 60 L 260 60 L 260 140 L 60 140 L 60 100 Q 60 60 100 60 Z" },
  { section: "LEFT_FRONT_DOOR", x: 60, y: 150, w: 200, h: 100, short: true },
  { section: "LEFT_PILLAR", x: 60, y: 260, w: 200, h: 40, short: true },
  { section: "LEFT_REAR_DOOR", x: 60, y: 310, w: 200, h: 100, short: true },
  { section: "LEFT_REAR_FENDER", x: 60, y: 420, w: 200, h: 80, short: true, pathD: "M 60 420 L 260 420 L 260 500 L 100 500 Q 60 500 60 460 Z" },

  // 右列（front→rear）
  { section: "RIGHT_FRONT_FENDER", x: 540, y: 60, w: 200, h: 80, short: true, pathD: "M 540 60 L 700 60 Q 740 60 740 100 L 740 140 L 540 140 Z" },
  { section: "RIGHT_FRONT_DOOR", x: 540, y: 150, w: 200, h: 100, short: true },
  { section: "RIGHT_PILLAR", x: 540, y: 260, w: 200, h: 40, short: true },
  { section: "RIGHT_REAR_DOOR", x: 540, y: 310, w: 200, h: 100, short: true },
  { section: "RIGHT_REAR_FENDER", x: 540, y: 420, w: 200, h: 80, short: true, pathD: "M 540 420 L 740 420 L 740 460 Q 740 500 700 500 L 540 500 Z" },
];

// ==================== 内装レイアウト ====================
// viewBox 600 x 320
const INTERIOR_PANELS: PanelRect[] = [
  { section: "ENGINE_COMPARTMENT", x: 200, y: 30, w: 200, h: 80 },
  { section: "LEFT_SIDE", x: 30, y: 130, w: 160, h: 100 },
  { section: "RIGHT_SIDE", x: 410, y: 130, w: 160, h: 100 },
  { section: "TRUNK_INSIDE", x: 200, y: 250, w: 200, h: 60 },
];

function formatTooltip(section: string, info: PanelInfo | undefined, unit: string): string {
  const ja = SECTION_JA[section] ?? section;
  if (!info || info.count === 0) return `${ja}: 測定なし`;
  const parts = [
    `${ja}`,
    `件数 ${info.count}`,
    info.maxValue !== null ? `最大 ${info.maxValue}${unit}` : null,
    info.avgValue !== null ? `平均 ${info.avgValue}${unit}` : null,
    info.maxInterpretation !== null ? `判定最大 ${info.maxInterpretation}` : null,
    info.materials.length > 0 ? `材質 ${info.materials.join(", ")}` : null,
  ].filter(Boolean);
  return parts.join(" / ");
}

function PanelShape({
  panel,
  info,
  unit,
}: {
  panel: PanelRect;
  info: PanelInfo | undefined;
  unit: string;
}) {
  const palette = paletteFor(info?.maxInterpretation ?? null);
  const isMeasured = !!info && info.count > 0;
  const labelText = panel.short ? SHORT_LABEL[panel.section] ?? panel.section : SECTION_JA[panel.section] ?? panel.section;
  const cx = panel.x + panel.w / 2;
  const cy = panel.y + panel.h / 2;

  const shapeStyle: CSSProperties = {
    fill: palette.fill,
    stroke: palette.stroke,
    strokeWidth: 1.5,
    transition: "fill 0.15s ease",
  };

  const tooltipText = formatTooltip(panel.section, info, unit);

  return (
    <g>
      <title>{tooltipText}</title>
      {panel.pathD ? (
        <path d={panel.pathD} style={shapeStyle} />
      ) : (
        <rect x={panel.x} y={panel.y} width={panel.w} height={panel.h} rx={6} ry={6} style={shapeStyle} />
      )}
      {/* 部位ラベル */}
      <text
        x={cx}
        y={cy - (isMeasured ? 8 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: palette.text, fontSize: panel.h < 50 ? 10 : 12, fontWeight: 600 }}
      >
        {labelText}
      </text>
      {/* 最大値 */}
      {isMeasured && info && info.maxValue !== null && (
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fill: palette.text, fontSize: panel.h < 50 ? 9 : 13, fontWeight: 700 }}
        >
          {info.maxValue}
          {unit}
        </text>
      )}
      {/* 判定バッジ（右上隅） */}
      {info && info.maxInterpretation !== null && (
        <g>
          <circle cx={panel.x + panel.w - 12} cy={panel.y + 12} r={10} style={{ fill: palette.badge }} />
          <text
            x={panel.x + panel.w - 12}
            y={panel.y + 13}
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fill: "white", fontSize: 11, fontWeight: 700 }}
          >
            {info.maxInterpretation}
          </text>
        </g>
      )}
    </g>
  );
}

export function ExteriorDiagram({ panels, unit }: { panels: Record<string, PanelInfo>; unit: string }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 800 560" className="w-full max-w-[760px] mx-auto block" role="img" aria-label="車体外装の膜厚測定図">
        {/* 方位ラベル */}
        <text x={400} y={28} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: 600, letterSpacing: 2 }}>
          FRONT ↑
        </text>
        <text x={400} y={548} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: 600, letterSpacing: 2 }}>
          REAR ↓
        </text>
        {/* ROOF にウィンドウラインを薄く表示 */}
        <line x1={285} y1={210} x2={515} y2={210} style={{ stroke: "var(--border-subtle)", strokeWidth: 1, strokeDasharray: "4 3" }} />
        <line x1={285} y1={350} x2={515} y2={350} style={{ stroke: "var(--border-subtle)", strokeWidth: 1, strokeDasharray: "4 3" }} />
        {EXTERIOR_PANELS.map((panel) => (
          <g key={panel.section}>
            <PanelShape panel={panel} info={panels[panel.section]} unit={unit} />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function InteriorDiagram({ panels, unit }: { panels: Record<string, PanelInfo>; unit: string }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 600 340" className="w-full max-w-[560px] mx-auto block" role="img" aria-label="車体内装の膜厚測定図">
        {/* 方位ラベル */}
        <text x={300} y={20} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>
          FRONT ↑
        </text>
        <text x={300} y={335} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>
          REAR ↓
        </text>
        {INTERIOR_PANELS.map((panel) => (
          <g key={panel.section}>
            <PanelShape panel={panel} info={panels[panel.section]} unit={unit} />
          </g>
        ))}
      </svg>
    </div>
  );
}

export function VehicleDiagramLegend() {
  const items: Array<{ label: string; level: number | null }> = [
    { label: "未測定", level: null },
    { label: "判定 1-2 (純正相当)", level: 2 },
    { label: "判定 3-4 (補修疑い)", level: 3 },
    { label: "判定 5 (要確認)", level: 5 },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-secondary">
      {items.map((item) => {
        const palette = paletteFor(item.level);
        return (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-4 rounded border"
              style={{ backgroundColor: palette.fill, borderColor: palette.stroke }}
            />
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
