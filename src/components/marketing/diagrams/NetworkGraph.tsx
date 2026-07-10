import type { NetworkNode, RegionalNode } from "@/lib/marketing/network";
import { buildSatellites, type Point } from "./networkGraphLayout";

/**
 * 証明書・施工店・メーカー・保険会社のネットワークを「点と線」で見せる図。
 *
 * 中心 = Ledra（証明書という共通の事実）、そこから 施工店 / メーカー / 保険会社
 * の3ハブが伸び、各ハブからは実データ（地域・提携メーカー・提携保険会社）を
 * 上位から扇状に配置する。個々の施工店名は公開しない（地域集計のみ）。
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

function Satellite({
  point,
  hub,
  label,
  count,
  unit,
  color,
}: {
  point: Point;
  hub: Point;
  label: string;
  count: number;
  unit: string;
  color: string;
}) {
  return (
    <g>
      <line
        x1={hub.x}
        y1={hub.y}
        x2={point.x}
        y2={point.y}
        stroke={color}
        strokeOpacity="0.35"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <circle cx={point.x} cy={point.y} r="5" fill={color} fillOpacity="0.85" />
      <text x={point.x} y={point.y - 12} textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="600">
        {label}
      </text>
      <text x={point.x} y={point.y + 20} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="9.5">
        {count.toLocaleString()}
        {unit}
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

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Ledra ネットワークの広がり（証明書・施工店・メーカー・保険会社・ユーザー）"
    >
      <defs>
        <radialGradient id="ng-core" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="rgba(176,141,63,0.5)" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.06)" />
        </radialGradient>
        <linearGradient id="ng-hub-shop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(77,159,255,0.28)" />
          <stop offset="100%" stopColor="rgba(77,159,255,0.08)" />
        </linearGradient>
        <linearGradient id="ng-hub-mfr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(167,139,250,0.28)" />
          <stop offset="100%" stopColor="rgba(167,139,250,0.08)" />
        </linearGradient>
        <linearGradient id="ng-hub-ins" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(52,211,153,0.28)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.08)" />
        </linearGradient>
      </defs>

      <circle cx={core.x} cy={core.y} r="130" fill="url(#ng-core)" opacity="0.5" />

      {/* Core → hub lines */}
      {[shopHub, mfrHub, insHub].map((h, i) => (
        <line key={i} x1={core.x} y1={core.y} x2={h.x} y2={h.y} stroke="rgba(176,141,63,0.4)" strokeWidth="1.5" />
      ))}
      <line
        x1={shopHub.x}
        y1={shopHub.y}
        x2={usersHub.x}
        y2={usersHub.y}
        stroke="rgba(77,159,255,0.3)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />

      {/* Region satellites (施工店の全国展開) */}
      {regionSats.map((s, i) => (
        <Satellite
          key={`region-${i}`}
          point={s.point}
          hub={shopHub}
          label={s.label}
          count={s.count}
          unit="店"
          color="#4d9fff"
        />
      ))}

      {/* Manufacturer satellites */}
      {mfrSats.map((s, i) => (
        <Satellite
          key={`mfr-${i}`}
          point={s.point}
          hub={mfrHub}
          label={s.label}
          count={s.count}
          unit="店"
          color="#a78bfa"
        />
      ))}

      {/* Insurer satellites */}
      {insSats.map((s, i) => (
        <Satellite
          key={`ins-${i}`}
          point={s.point}
          hub={insHub}
          label={s.label}
          count={s.count}
          unit="店"
          color="#34d399"
        />
      ))}

      {/* Core node — 証明書 */}
      <g>
        <circle cx={core.x} cy={core.y} r="66" fill="#0d1525" stroke="rgba(176,141,63,0.55)" strokeWidth="1.5" />
        <text
          x={core.x}
          y={core.y - 10}
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontSize="10.5"
          letterSpacing="1.5"
        >
          証明書
        </text>
        <text x={core.x} y={core.y + 16} textAnchor="middle" fill="#ffffff" fontSize="21" fontWeight="700">
          {certificateCount.toLocaleString()}
        </text>
        <text x={core.x} y={core.y + 33} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9">
          件・発行累計
        </text>
      </g>

      {/* Hub: 施工店 */}
      <g>
        <rect
          x={shopHub.x - 78}
          y={shopHub.y - 44}
          width="156"
          height="88"
          rx="16"
          fill="url(#ng-hub-shop)"
          stroke="rgba(77,159,255,0.5)"
          strokeWidth="1.5"
        />
        <text
          x={shopHub.x}
          y={shopHub.y - 12}
          textAnchor="middle"
          fill="rgba(77,159,255,0.85)"
          fontSize="10"
          fontWeight="600"
          letterSpacing="2"
        >
          施工店
        </text>
        <text x={shopHub.x} y={shopHub.y + 16} textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="700">
          {shopCount.toLocaleString()}
        </text>
        <text x={shopHub.x} y={shopHub.y + 33} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9.5">
          全国の提携施工店
        </text>
      </g>

      {/* Hub: メーカー */}
      <g>
        <rect
          x={mfrHub.x - 66}
          y={mfrHub.y - 38}
          width="132"
          height="76"
          rx="16"
          fill="url(#ng-hub-mfr)"
          stroke="rgba(167,139,250,0.5)"
          strokeWidth="1.5"
        />
        <text
          x={mfrHub.x}
          y={mfrHub.y - 10}
          textAnchor="middle"
          fill="rgba(167,139,250,0.9)"
          fontSize="10"
          fontWeight="600"
          letterSpacing="2"
        >
          メーカー
        </text>
        <text x={mfrHub.x} y={mfrHub.y + 15} textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="700">
          {manufacturerCount.toLocaleString()}
        </text>
        <text x={mfrHub.x} y={mfrHub.y + 30} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9">
          認定メーカー
        </text>
      </g>

      {/* Hub: 保険会社 */}
      <g>
        <rect
          x={insHub.x - 66}
          y={insHub.y - 38}
          width="132"
          height="76"
          rx="16"
          fill="url(#ng-hub-ins)"
          stroke="rgba(52,211,153,0.5)"
          strokeWidth="1.5"
        />
        <text
          x={insHub.x}
          y={insHub.y - 10}
          textAnchor="middle"
          fill="rgba(52,211,153,0.9)"
          fontSize="10"
          fontWeight="600"
          letterSpacing="2"
        >
          保険会社
        </text>
        <text x={insHub.x} y={insHub.y + 15} textAnchor="middle" fill="#ffffff" fontSize="20" fontWeight="700">
          {insurerCount.toLocaleString()}
        </text>
        <text x={insHub.x} y={insHub.y + 30} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="9">
          提携保険会社
        </text>
      </g>

      {/* Users badge */}
      <g>
        <circle
          cx={usersHub.x}
          cy={usersHub.y}
          r="42"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1.5"
        />
        <text
          x={usersHub.x}
          y={usersHub.y - 6}
          textAnchor="middle"
          fill="rgba(255,255,255,0.6)"
          fontSize="9.5"
          letterSpacing="1"
        >
          ユーザー
        </text>
        <text x={usersHub.x} y={usersHub.y + 14} textAnchor="middle" fill="#ffffff" fontSize="17" fontWeight="700">
          {customerCount.toLocaleString()}
        </text>
      </g>

      <text
        x={W / 2}
        y="28"
        textAnchor="middle"
        fill="rgba(255,255,255,0.45)"
        fontSize="11"
        fontWeight="600"
        letterSpacing="3"
      >
        LEDRA NETWORK
      </text>
    </svg>
  );
}
