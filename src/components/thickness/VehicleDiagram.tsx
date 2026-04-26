import type { CSSProperties, ReactNode } from "react";

/**
 * 車体展開図（NexPTG 膜厚測定の可視化）
 *
 * セダン上面視点を再現した exploded view。中央列にボンネット→ウィンドシールド
 * →ルーフ→リアガラス→トランクの流れを描き、左右にはフェンダー・ドア・ピラーを
 * 自然な台形/曲線で配置。ヘッドライト・テールランプ・サイドミラー・タイヤを
 * 描画してリアル度を上げている。
 *
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

type PanelDef = {
  section: string;
  /** SVG path data。形状は車体上面視を踏まえた台形・曲線。 */
  pathD: string;
  /** ラベル中心座標 */
  labelX: number;
  labelY: number;
  /** バッジを置く右上アンカー */
  badgeX: number;
  badgeY: number;
  /** 短縮ラベルを使うか */
  short?: boolean;
  /** ラベル領域が小さい部位（フォント縮小） */
  compact?: boolean;
};

// ==================== 外装レイアウト ====================
// viewBox 820 x 640
// 中央列: x=290-530（HOOD/WINDSHIELD/ROOF/REAR_GLASS/TRUNK）
// 左列:   x=80-260
// 右列:   x=560-740
// タイヤ等の装飾要素は body 外側へ
const EXTERIOR_PANELS: PanelDef[] = [
  // ── 中央列 ──
  {
    section: "HOOD",
    // 前端は狭く台形（フロントバンパー側）→ ウィンドシールド側で拡大
    pathD: "M 320 60 L 500 60 Q 530 60 530 90 L 530 180 L 290 180 L 290 90 Q 290 60 320 60 Z",
    labelX: 410,
    labelY: 130,
    badgeX: 510,
    badgeY: 78,
  },
  {
    section: "ROOF",
    // ルーフは中央の長方形（ウィンドシールド/リアガラスの間）
    pathD: "M 290 240 L 530 240 L 530 400 L 290 400 Z",
    labelX: 410,
    labelY: 320,
    badgeX: 510,
    badgeY: 258,
  },
  {
    section: "TRUNK",
    // 後端は狭く台形
    pathD: "M 290 460 L 530 460 L 530 550 Q 530 580 500 580 L 320 580 Q 290 580 290 550 Z",
    labelX: 410,
    labelY: 510,
    badgeX: 510,
    badgeY: 478,
  },

  // ── 左列（front→rear）──
  {
    section: "LEFT_FRONT_FENDER",
    // 前端で外側に膨らみつつヘッドライト下まで覆う形状
    pathD: "M 110 60 L 260 60 L 260 160 L 80 160 L 80 110 Q 80 60 110 60 Z",
    labelX: 170,
    labelY: 110,
    badgeX: 240,
    badgeY: 78,
    short: true,
  },
  {
    section: "LEFT_FRONT_DOOR",
    pathD: "M 80 175 L 260 175 L 260 290 L 80 290 Z",
    labelX: 170,
    labelY: 232,
    badgeX: 240,
    badgeY: 193,
    short: true,
  },
  {
    section: "LEFT_PILLAR",
    pathD: "M 80 305 L 260 305 L 260 345 L 80 345 Z",
    labelX: 170,
    labelY: 325,
    badgeX: 240,
    badgeY: 323,
    short: true,
    compact: true,
  },
  {
    section: "LEFT_REAR_DOOR",
    pathD: "M 80 360 L 260 360 L 260 470 L 80 470 Z",
    labelX: 170,
    labelY: 415,
    badgeX: 240,
    badgeY: 378,
    short: true,
  },
  {
    section: "LEFT_REAR_FENDER",
    // 後端で外側に膨らむ
    pathD: "M 80 485 L 260 485 L 260 580 L 110 580 Q 80 580 80 540 Z",
    labelX: 170,
    labelY: 532,
    badgeX: 240,
    badgeY: 503,
    short: true,
  },

  // ── 右列（mirror）──
  {
    section: "RIGHT_FRONT_FENDER",
    pathD: "M 560 60 L 710 60 Q 740 60 740 110 L 740 160 L 560 160 Z",
    labelX: 650,
    labelY: 110,
    badgeX: 720,
    badgeY: 78,
    short: true,
  },
  {
    section: "RIGHT_FRONT_DOOR",
    pathD: "M 560 175 L 740 175 L 740 290 L 560 290 Z",
    labelX: 650,
    labelY: 232,
    badgeX: 720,
    badgeY: 193,
    short: true,
  },
  {
    section: "RIGHT_PILLAR",
    pathD: "M 560 305 L 740 305 L 740 345 L 560 345 Z",
    labelX: 650,
    labelY: 325,
    badgeX: 720,
    badgeY: 323,
    short: true,
    compact: true,
  },
  {
    section: "RIGHT_REAR_DOOR",
    pathD: "M 560 360 L 740 360 L 740 470 L 560 470 Z",
    labelX: 650,
    labelY: 415,
    badgeX: 720,
    badgeY: 378,
    short: true,
  },
  {
    section: "RIGHT_REAR_FENDER",
    pathD: "M 560 485 L 740 485 L 740 540 Q 740 580 710 580 L 560 580 Z",
    labelX: 650,
    labelY: 532,
    badgeX: 720,
    badgeY: 503,
    short: true,
  },
];

// ==================== 内装レイアウト ====================
const INTERIOR_PANELS: PanelDef[] = [
  {
    section: "ENGINE_COMPARTMENT",
    pathD: "M 230 30 L 370 30 Q 400 30 400 60 L 400 120 L 200 120 L 200 60 Q 200 30 230 30 Z",
    labelX: 300,
    labelY: 75,
    badgeX: 380,
    badgeY: 48,
  },
  {
    section: "LEFT_SIDE",
    pathD: "M 30 140 L 190 140 L 190 240 L 30 240 Z",
    labelX: 110,
    labelY: 190,
    badgeX: 170,
    badgeY: 158,
  },
  {
    section: "RIGHT_SIDE",
    pathD: "M 410 140 L 570 140 L 570 240 L 410 240 Z",
    labelX: 490,
    labelY: 190,
    badgeX: 550,
    badgeY: 158,
  },
  {
    section: "TRUNK_INSIDE",
    pathD: "M 200 260 L 400 260 L 400 300 Q 400 320 380 320 L 220 320 Q 200 320 200 300 Z",
    labelX: 300,
    labelY: 290,
    badgeX: 380,
    badgeY: 278,
  },
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

function PanelShape({ panel, info, unit }: { panel: PanelDef; info: PanelInfo | undefined; unit: string }) {
  const palette = paletteFor(info?.maxInterpretation ?? null);
  const isMeasured = !!info && info.count > 0;
  const labelText = panel.short
    ? (SHORT_LABEL[panel.section] ?? panel.section)
    : (SECTION_JA[panel.section] ?? panel.section);

  const shapeStyle: CSSProperties = {
    fill: palette.fill,
    stroke: palette.stroke,
    strokeWidth: 1.5,
    transition: "fill 0.15s ease",
  };

  const tooltipText = formatTooltip(panel.section, info, unit);
  const labelFontSize = panel.compact ? 10 : 12;
  const valueFontSize = panel.compact ? 9 : 13;
  const labelOffsetY = panel.compact ? 0 : isMeasured ? -8 : 0;

  return (
    <g>
      <title>{tooltipText}</title>
      <path d={panel.pathD} style={shapeStyle} />
      <text
        x={panel.labelX}
        y={panel.labelY + labelOffsetY}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: palette.text, fontSize: labelFontSize, fontWeight: 600, pointerEvents: "none" }}
      >
        {labelText}
      </text>
      {isMeasured && info && info.maxValue !== null && !panel.compact && (
        <text
          x={panel.labelX}
          y={panel.labelY + 10}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fill: palette.text, fontSize: valueFontSize, fontWeight: 700, pointerEvents: "none" }}
        >
          {info.maxValue}
          {unit}
        </text>
      )}
      {isMeasured && info && info.maxValue !== null && panel.compact && (
        <text
          x={panel.labelX + 50}
          y={panel.labelY}
          textAnchor="start"
          dominantBaseline="middle"
          style={{ fill: palette.text, fontSize: 10, fontWeight: 700, pointerEvents: "none" }}
        >
          {info.maxValue}
          {unit}
        </text>
      )}
      {info && info.maxInterpretation !== null && (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={panel.badgeX} cy={panel.badgeY} r={10} style={{ fill: palette.badge }} />
          <text
            x={panel.badgeX}
            y={panel.badgeY + 1}
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

/** 装飾要素: タイヤ・ヘッドライト・テールランプ・サイドミラー・ガラス */
function ExteriorDecorations(): ReactNode {
  const wheelStyle: CSSProperties = {
    fill: "var(--text-primary)",
    opacity: 0.78,
  };
  const wheelHubStyle: CSSProperties = {
    fill: "var(--bg-surface-solid)",
    opacity: 0.5,
  };
  const headlightStyle: CSSProperties = {
    fill: "rgba(254, 240, 138, 0.85)",
    stroke: "var(--text-muted)",
    strokeWidth: 0.5,
  };
  const taillightStyle: CSSProperties = {
    fill: "rgba(220, 38, 38, 0.55)",
    stroke: "var(--accent-red-text)",
    strokeWidth: 0.5,
  };
  const mirrorStyle: CSSProperties = {
    fill: "var(--text-muted)",
    opacity: 0.6,
  };
  const glassStyle: CSSProperties = {
    fill: "var(--bg-inset)",
    stroke: "var(--border-default)",
    strokeWidth: 1,
    strokeDasharray: "3 2",
    opacity: 0.85,
  };

  return (
    <g>
      {/* ウィンドシールド（HOODとROOFの間の台形） */}
      <path d="M 290 195 L 530 195 L 510 235 L 310 235 Z" style={glassStyle} />
      <text x={410} y={218} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 10, opacity: 0.7 }}>
        ウィンドシールド
      </text>
      {/* リアガラス（ROOFとTRUNKの間の台形） */}
      <path d="M 310 405 L 510 405 L 530 445 L 290 445 Z" style={glassStyle} />
      <text x={410} y={428} textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 10, opacity: 0.7 }}>
        リアガラス
      </text>

      {/* タイヤ4輪（外装パネルの外側に飛び出す） */}
      <g>
        {/* 左前輪 */}
        <ellipse cx={62} cy={130} rx={14} ry={28} style={wheelStyle} />
        <ellipse cx={62} cy={130} rx={5} ry={10} style={wheelHubStyle} />
        {/* 左後輪 */}
        <ellipse cx={62} cy={520} rx={14} ry={28} style={wheelStyle} />
        <ellipse cx={62} cy={520} rx={5} ry={10} style={wheelHubStyle} />
        {/* 右前輪 */}
        <ellipse cx={758} cy={130} rx={14} ry={28} style={wheelStyle} />
        <ellipse cx={758} cy={130} rx={5} ry={10} style={wheelHubStyle} />
        {/* 右後輪 */}
        <ellipse cx={758} cy={520} rx={14} ry={28} style={wheelStyle} />
        <ellipse cx={758} cy={520} rx={5} ry={10} style={wheelHubStyle} />
      </g>

      {/* ヘッドライト（HOODの前端、左右） */}
      <g>
        <rect x={300} y={66} width={45} height={14} rx={4} ry={6} style={headlightStyle} />
        <rect x={475} y={66} width={45} height={14} rx={4} ry={6} style={headlightStyle} />
      </g>

      {/* テールランプ（TRUNKの後端、左右） */}
      <g>
        <rect x={300} y={560} width={45} height={12} rx={2} ry={3} style={taillightStyle} />
        <rect x={475} y={560} width={45} height={12} rx={2} ry={3} style={taillightStyle} />
      </g>

      {/* サイドミラー（フロントドア外側、左右） */}
      <g>
        <ellipse cx={70} cy={195} rx={8} ry={11} style={mirrorStyle} />
        <ellipse cx={750} cy={195} rx={8} ry={11} style={mirrorStyle} />
      </g>
    </g>
  );
}

export function ExteriorDiagram({ panels, unit }: { panels: Record<string, PanelInfo>; unit: string }) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 820 640"
        className="w-full max-w-[800px] mx-auto block"
        role="img"
        aria-label="車体外装の膜厚測定図"
      >
        {/* 方位ラベル */}
        <text
          x={410}
          y={20}
          textAnchor="middle"
          style={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: 600, letterSpacing: 2 }}
        >
          FRONT ↑
        </text>
        <text
          x={410}
          y={628}
          textAnchor="middle"
          style={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: 600, letterSpacing: 2 }}
        >
          REAR ↓
        </text>

        {/* 装飾（タイヤ・ライト・ガラス・ミラー）はパネルより前に描画して背面に */}
        <ExteriorDecorations />

        {/* 各パネル */}
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
      <svg
        viewBox="0 0 600 360"
        className="w-full max-w-[560px] mx-auto block"
        role="img"
        aria-label="車体内装の膜厚測定図"
      >
        <text
          x={300}
          y={18}
          textAnchor="middle"
          style={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}
        >
          FRONT ↑
        </text>
        <text
          x={300}
          y={350}
          textAnchor="middle"
          style={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}
        >
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
