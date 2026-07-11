import type { NetworkNode, RegionalNode } from "@/lib/marketing/network";
import { buildSatellites, type Point, type Satellite as SatelliteData } from "./networkGraphLayout";
import { BRAND_ACCENT } from "@/lib/marketing/brandAccentColors";

/**
 * 証明書・施工店・メーカー・保険会社のネットワークを「点と線」で見せる図。
 *
 * 中心 = Ledra（証明書という共通の事実）、そこから 施工店 / メーカー / 保険会社
 * の3ハブが伸び、各ハブからは実データ（地域・提携メーカー・提携保険会社）を
 * 上位から扇状に配置する。個々の施工店名は公開しない（地域集計のみ）。
 *
 * 実装メモ:
 * - Server Component のまま。動きは SMIL（animateMotion / animateTransform）と
 *   SVG 内 <style>（CSP は style-src 'unsafe-inline' 許可済み）だけで実現し、
 *   クライアント JS を増やさない。
 * - prefers-reduced-motion では移動パーティクルと回転を停止する。
 * - 光彩は「太いぼかしストローク + 細い実線」の二重描画（filter より GPU 負荷が軽い）。
 */

type NetworkGraphProps = {
  certificateCount: number;
  shopCount: number;
  /** 有効なメーカー数 (認定エッジが0件のメーカーも含む、統計行と一致させる) */
  manufacturerCount: number;
  /** 有効な保険会社数 (契約エッジが0件の保険会社も含む、統計行と一致させる) */
  insurerCount: number;
  customerCount: number;
  regions: RegionalNode[];
  manufacturers: NetworkNode[];
  insurers: NetworkNode[];
  /** 各カテゴリの扇に何件まで個別ノードを出すか (残りは "+N" ノードにまとめる) */
  maxSatellites?: number;
  className?: string;
};

const { gold: GOLD, blue: BLUE, violet: VIOLET, emerald: EMERALD } = BRAND_ACCENT;

/** hub → satellite の緩いカーブ（中点を法線方向に少し押し出す） */
function curve(from: Point, to: Point, bend = 0.14): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
}

/** 光彩つきエッジ: ぼかした太線の上に実線を重ねる */
function GlowEdge({ d, color, width = 1.6, dash }: { d: string; color: string; width?: number; dash?: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeOpacity="0.16" strokeWidth={width * 4} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity="0.55"
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dash}
      />
    </g>
  );
}

/** エッジ上を流れる光の粒（SMIL / reduced-motion では非表示） */
function FlowDot({
  d,
  color,
  dur,
  begin,
  r = 2.6,
}: {
  d: string;
  color: string;
  dur: string;
  begin: string;
  r?: number;
}) {
  return (
    <g className="ng-motion">
      <circle r={r * 2.4} fill={color} opacity="0.18">
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={d} />
      </circle>
      <circle r={r} fill={color}>
        <animateMotion dur={dur} begin={begin} repeatCount="indefinite" path={d} />
      </circle>
    </g>
  );
}

function Satellite({
  sat,
  hub,
  color,
  unit,
  index,
}: {
  sat: SatelliteData;
  hub: Point;
  color: string;
  unit: string;
  index: number;
}) {
  const { point, label, count } = sat;
  const d = curve(hub, point, 0.1);
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity="0.28"
        strokeWidth="1"
        strokeDasharray="2 4"
        strokeLinecap="round"
      />
      {/* halo + core dot（pulse は reduced-motion で停止） */}
      <circle cx={point.x} cy={point.y} r="10" fill={color} opacity="0.1" className="ng-motion">
        <animate
          attributeName="opacity"
          values="0.08;0.2;0.08"
          dur="4s"
          begin={`${index * 0.7}s`}
          repeatCount="indefinite"
        />
      </circle>
      <circle cx={point.x} cy={point.y} r="4" fill="#0a0f1a" stroke={color} strokeWidth="1.5" />
      <circle cx={point.x} cy={point.y} r="1.6" fill={color} />
      <text
        x={point.x}
        y={point.y - 13}
        textAnchor="middle"
        fill="rgba(255,255,255,0.92)"
        fontSize="10.5"
        fontWeight="600"
      >
        {label}
      </text>
      <text
        x={point.x}
        y={point.y + 19}
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="9"
        fontFamily="var(--font-mono, ui-monospace, monospace)"
      >
        {count.toLocaleString()}
        {unit}
      </text>
    </g>
  );
}

/** ガラス質のハブカード */
function HubCard({
  hub,
  w,
  h,
  color,
  gradientId,
  tag,
  value,
  caption,
}: {
  hub: Point;
  w: number;
  h: number;
  color: string;
  gradientId: string;
  tag: string;
  value: string;
  caption: string;
}) {
  const x = hub.x - w / 2;
  const y = hub.y - h / 2;
  return (
    <g>
      {/* 背面の光 */}
      <ellipse cx={hub.x} cy={hub.y} rx={w * 0.72} ry={h * 0.78} fill={color} opacity="0.07" />
      <rect x={x} y={y} width={w} height={h} rx="18" fill="#0b1220" fillOpacity="0.92" />
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="18"
        fill={`url(#${gradientId})`}
        stroke={color}
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {/* 上端のハイライト線 */}
      <path
        d={`M ${x + 18} ${y + 0.5} H ${x + w - 18}`}
        stroke="rgba(255,255,255,0.28)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx={hub.x - w / 2 + 20} cy={y + 19} r="2.6" fill={color} />
      <text x={hub.x - w / 2 + 30} y={y + 22.5} fill={color} fontSize="9.5" fontWeight="600" letterSpacing="2.5">
        {tag}
      </text>
      <text
        x={hub.x}
        y={y + h - 30}
        textAnchor="middle"
        fill="#ffffff"
        fontSize="26"
        fontWeight="700"
        fontFamily="var(--font-mono, ui-monospace, monospace)"
      >
        {value}
      </text>
      <text x={hub.x} y={y + h - 12} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9.5">
        {caption}
      </text>
    </g>
  );
}

export function NetworkGraph({
  certificateCount,
  shopCount,
  manufacturerCount,
  insurerCount,
  customerCount,
  regions,
  manufacturers,
  insurers,
  maxSatellites = 6,
  className = "",
}: NetworkGraphProps) {
  const W = 900;
  const H = 620;
  const core: Point = { x: 450, y: 320 };
  const shopHub: Point = { x: 200, y: 320 };
  const mfrHub: Point = { x: 660, y: 150 };
  const insHub: Point = { x: 660, y: 490 };
  const usersHub: Point = { x: 200, y: 500 };

  const regionSats = buildSatellites(
    regions.map((r) => ({ label: r.prefecture, count: r.count })),
    shopHub,
    150,
    150,
    210,
    maxSatellites,
  );
  const mfrSats = buildSatellites(
    manufacturers.map((m) => ({ label: m.name, count: m.shopCount })),
    mfrHub,
    150,
    -60,
    20,
    maxSatellites,
  );
  const insSats = buildSatellites(
    insurers.map((i) => ({ label: i.name, count: i.shopCount })),
    insHub,
    150,
    -20,
    60,
    maxSatellites,
  );

  // 主要エッジ（証明書コアを軸にした流れ）
  const eShop = curve(shopHub, core, -0.12);
  const eMfr = curve(core, mfrHub, -0.12);
  const eIns = curve(core, insHub, 0.12);
  const eUsers = curve(shopHub, usersHub, -0.18);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Ledra ネットワークの広がり（証明書・施工店・メーカー・保険会社・ユーザー）"
    >
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ng-motion, .ng-spin { display: none; }
        }
      `}</style>
      <defs>
        <radialGradient id="ng-vignette" cx="0.5" cy="0.5" r="0.72">
          <stop offset="0%" stopColor="rgba(96,165,250,0.06)" />
          <stop offset="60%" stopColor="rgba(96,165,250,0.02)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <radialGradient id="ng-core-glow" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="rgba(201,165,92,0.35)" />
          <stop offset="45%" stopColor="rgba(201,165,92,0.08)" />
          <stop offset="100%" stopColor="rgba(201,165,92,0)" />
        </radialGradient>
        <radialGradient id="ng-core-face" cx="0.5" cy="0.35">
          <stop offset="0%" stopColor="#131c30" />
          <stop offset="100%" stopColor="#0a0f1c" />
        </radialGradient>
        <linearGradient id="ng-hub-shop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(77,159,255,0.16)" />
          <stop offset="100%" stopColor="rgba(77,159,255,0.03)" />
        </linearGradient>
        <linearGradient id="ng-hub-mfr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(167,139,250,0.16)" />
          <stop offset="100%" stopColor="rgba(167,139,250,0.03)" />
        </linearGradient>
        <linearGradient id="ng-hub-ins" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(52,211,153,0.16)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.03)" />
        </linearGradient>
        <pattern id="ng-dots" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgba(148,180,255,0.10)" />
        </pattern>
        <radialGradient id="ng-dots-mask-g" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="#000" />
        </radialGradient>
        <mask id="ng-dots-mask">
          <rect width={W} height={H} fill="url(#ng-dots-mask-g)" />
        </mask>
      </defs>

      {/* 背景: ドットグリッド + ヴィネット */}
      <rect width={W} height={H} fill="url(#ng-dots)" mask="url(#ng-dots-mask)" />
      <rect width={W} height={H} fill="url(#ng-vignette)" />

      {/* 主要エッジ（光彩つきカーブ） */}
      <GlowEdge d={eShop} color={BLUE} />
      <GlowEdge d={eMfr} color={VIOLET} />
      <GlowEdge d={eIns} color={EMERALD} />
      <GlowEdge d={eUsers} color={BLUE} width={1.2} dash="1 6" />

      {/* サテライト（実データ） */}
      {regionSats.map((s, i) => (
        <Satellite key={`region-${i}`} sat={s} hub={shopHub} color={BLUE} unit="店" index={i} />
      ))}
      {mfrSats.map((s, i) => (
        <Satellite key={`mfr-${i}`} sat={s} hub={mfrHub} color={VIOLET} unit="店" index={i + 1} />
      ))}
      {insSats.map((s, i) => (
        <Satellite key={`ins-${i}`} sat={s} hub={insHub} color={EMERALD} unit="店" index={i + 2} />
      ))}

      {/* データの流れ: 施工店 → 証明書 → メーカー / 保険会社、施工店 → ユーザー */}
      <FlowDot d={eShop} color={BLUE} dur="4.5s" begin="0s" />
      <FlowDot d={eShop} color={BLUE} dur="4.5s" begin="2.2s" />
      <FlowDot d={eMfr} color={VIOLET} dur="5s" begin="1.1s" />
      <FlowDot d={eIns} color={EMERALD} dur="5s" begin="0.4s" />
      <FlowDot d={eIns} color={EMERALD} dur="5s" begin="2.9s" />
      <FlowDot d={eUsers} color={BLUE} dur="6s" begin="1.8s" r={2} />

      {/* ハブカード */}
      <HubCard
        hub={shopHub}
        w={168}
        h={96}
        color={BLUE}
        gradientId="ng-hub-shop"
        tag="施工店"
        value={shopCount.toLocaleString()}
        caption="全国の提携施工店"
      />
      <HubCard
        hub={mfrHub}
        w={148}
        h={90}
        color={VIOLET}
        gradientId="ng-hub-mfr"
        tag="メーカー"
        value={manufacturerCount.toLocaleString()}
        caption="認定メーカー"
      />
      <HubCard
        hub={insHub}
        w={148}
        h={90}
        color={EMERALD}
        gradientId="ng-hub-ins"
        tag="保険会社"
        value={insurerCount.toLocaleString()}
        caption="提携保険会社"
      />

      {/* コア: 証明書（信頼の中心 = Gold の差し色） */}
      <g>
        <circle cx={core.x} cy={core.y} r="118" fill="url(#ng-core-glow)" />
        {/* 回転する軌道リング */}
        <g className="ng-spin">
          <g>
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${core.x} ${core.y}`}
              to={`360 ${core.x} ${core.y}`}
              dur="90s"
              repeatCount="indefinite"
            />
            <circle
              cx={core.x}
              cy={core.y}
              r="88"
              fill="none"
              stroke={GOLD}
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="1 10"
              strokeLinecap="round"
            />
            <circle cx={core.x + 88} cy={core.y} r="2.4" fill={GOLD} opacity="0.8" />
          </g>
        </g>
        <circle
          cx={core.x}
          cy={core.y}
          r="70"
          fill="url(#ng-core-face)"
          stroke={GOLD}
          strokeOpacity="0.6"
          strokeWidth="1.2"
        />
        <circle cx={core.x} cy={core.y} r="63" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
        <text
          x={core.x}
          y={core.y - 22}
          textAnchor="middle"
          fill={GOLD}
          fontSize="9.5"
          fontWeight="600"
          letterSpacing="3"
        >
          証明書
        </text>
        <text
          x={core.x}
          y={core.y + 12}
          textAnchor="middle"
          fill="#ffffff"
          fontSize="30"
          fontWeight="700"
          fontFamily="var(--font-mono, ui-monospace, monospace)"
        >
          {certificateCount.toLocaleString()}
        </text>
        <text x={core.x} y={core.y + 32} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9">
          件・発行累計
        </text>
      </g>

      {/* ユーザー（車のオーナー） */}
      <g>
        <circle cx={usersHub.x} cy={usersHub.y} r="52" fill={BLUE} opacity="0.05" />
        <circle
          cx={usersHub.x}
          cy={usersHub.y}
          r="42"
          fill="#0b1220"
          fillOpacity="0.92"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
        <text
          x={usersHub.x}
          y={usersHub.y - 8}
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontSize="9"
          letterSpacing="1.5"
        >
          ユーザー
        </text>
        <text
          x={usersHub.x}
          y={usersHub.y + 14}
          textAnchor="middle"
          fill="#ffffff"
          fontSize="18"
          fontWeight="700"
          fontFamily="var(--font-mono, ui-monospace, monospace)"
        >
          {customerCount.toLocaleString()}
        </text>
      </g>

      <text
        x={W / 2}
        y="30"
        textAnchor="middle"
        fill="rgba(255,255,255,0.4)"
        fontSize="10.5"
        fontWeight="600"
        letterSpacing="4"
      >
        LEDRA NETWORK
      </text>
      <text x={W / 2} y={H - 14} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9">
        本番データベースの実数から描画しています
      </text>
    </svg>
  );
}
