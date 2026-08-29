/**
 * Security three-layer diagram — 通信 / 保存 / ペイロードの3層。
 */
export function SecurityLayersDiagram({ className = "" }: { className?: string }) {
  const layers = [
    {
      name: "通信レイヤー",
      tech: "TLS 1.2+ / HSTS",
      detail: "全トラフィックを暗号化。中間者攻撃を遮断。",
      hue: "rgba(96,165,250,",
    },
    {
      name: "保存レイヤー",
      tech: "AES-256 / 自動鍵ローテーション",
      detail: "Supabase Postgres のディスク暗号化・バックアップも暗号化。",
      hue: "rgba(139,200,255,",
    },
    {
      name: "ペイロードレイヤー",
      tech: "pepper 付きハッシュ / C2PA 署名 / Polygon anchor",
      detail: "機微データはアプリ層で不可逆化し、改ざんを検知可能に。",
      hue: "rgba(167,139,250,",
    },
  ];

  return (
    <svg
      viewBox="0 0 760 420"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="セキュリティ3層の構造図"
    >
      <defs>
        {layers.map((l, i) => (
          <linearGradient key={i} id={`sec-layer-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={`${l.hue}0.24)`} />
            <stop offset="100%" stopColor={`${l.hue}0.08)`} />
          </linearGradient>
        ))}
      </defs>

      {/* Caption */}
      <text
        x="380"
        y="36"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="11"
        fontWeight="600"
        letterSpacing="3"
      >
        THREE LAYERS OF PROTECTION
      </text>

      {/* 3 layer bars, stacked */}
      {layers.map((l, i) => {
        const y = 70 + i * 105;
        return (
          <g key={l.name}>
            <rect
              x="60"
              y={y}
              width="640"
              height="85"
              rx="14"
              fill={`url(#sec-layer-${i})`}
              stroke="rgba(255,255,255,0.12)"
            />
            {/* Left icon circle */}
            <circle cx="105" cy={y + 42} r="22" fill={`${l.hue}0.2)`} stroke={`${l.hue}0.45)`} />
            <text x="105" y={y + 48} textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="700">
              {String(i + 1).padStart(2, "0")}
            </text>

            {/* Copy */}
            <text x="150" y={y + 30} fill="#ffffff" fontSize="15" fontWeight="700">
              {l.name}
            </text>
            <text x="150" y={y + 50} fill="rgba(167,139,250,0.85)" fontSize="11" fontFamily="monospace">
              {l.tech}
            </text>
            <text x="150" y={y + 70} fill="rgba(255,255,255,0.55)" fontSize="11">
              {l.detail}
            </text>
          </g>
        );
      })}

      {/* Bottom caption */}
      <text x="380" y="405" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">
        単独の層が突破されても、他の層で守る多層防御の設計。
      </text>
    </svg>
  );
}
