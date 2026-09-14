/**
 * Four-portal architecture diagram.
 *
 * Shows施工店/代理店/保険会社/顧客 の4ポータルが同じ Ledra Core
 * を介して同じ「施工記録」を共有している構造。
 */
export function FourPortalDiagram({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 760 500"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Ledra 4ポータルのアーキテクチャ図"
    >
      <defs>
        <linearGradient id="fp-node" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(96,165,250,0.22)" />
          <stop offset="100%" stopColor="rgba(167,139,250,0.1)" />
        </linearGradient>
        <radialGradient id="fp-core" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="rgba(167,139,250,0.45)" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.08)" />
        </radialGradient>
      </defs>

      {/* Core glow */}
      <circle cx="380" cy="250" r="140" fill="url(#fp-core)" opacity="0.4" />

      {/* Connecting lines */}
      {[
        { x1: 160, y1: 120, x2: 330, y2: 215 }, // 施工店 → core
        { x1: 600, y1: 120, x2: 430, y2: 215 }, // 代理店 → core
        { x1: 160, y1: 380, x2: 330, y2: 285 }, // 保険会社 → core
        { x1: 600, y1: 380, x2: 430, y2: 285 }, // 顧客 → core
      ].map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="rgba(96,165,250,0.3)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />
      ))}

      {/* Core node */}
      <g>
        <rect
          x="310"
          y="205"
          width="140"
          height="90"
          rx="20"
          fill="url(#fp-node)"
          stroke="rgba(167,139,250,0.5)"
          strokeWidth="1.5"
        />
        <text x="380" y="235" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="700">
          Ledra Core
        </text>
        <text x="380" y="255" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          施工記録・証明書
        </text>
        <text x="380" y="272" textAnchor="middle" fill="rgba(167,139,250,0.7)" fontSize="10">
          + Polygon anchoring
        </text>
        <text x="380" y="285" textAnchor="middle" fill="rgba(167,139,250,0.7)" fontSize="10">
          + C2PA signing
        </text>
      </g>

      {/* 4 portal nodes */}
      {[
        { x: 25, y: 75, title: "施工店", subtitle: "証明書発行・POS", tag: "ADMIN" },
        { x: 560, y: 75, title: "代理店", subtitle: "紹介・コミッション", tag: "AGENT" },
        { x: 25, y: 335, title: "保険会社", subtitle: "検索・査定・監査", tag: "INSURER" },
        { x: 560, y: 335, title: "顧客", subtitle: "証明書の閲覧", tag: "CUSTOMER" },
      ].map((n) => (
        <g key={n.tag}>
          <rect x={n.x} y={n.y} width="175" height="95" rx="16" fill="url(#fp-node)" stroke="rgba(255,255,255,0.14)" />
          <text
            x={n.x + 87}
            y={n.y + 32}
            textAnchor="middle"
            fill="rgba(96,165,250,0.75)"
            fontSize="10"
            fontWeight="600"
            letterSpacing="2"
          >
            {n.tag}
          </text>
          <text x={n.x + 87} y={n.y + 58} textAnchor="middle" fill="#ffffff" fontSize="15" fontWeight="700">
            {n.title}
          </text>
          <text x={n.x + 87} y={n.y + 79} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
            {n.subtitle}
          </text>
        </g>
      ))}

      {/* Top-center caption */}
      <text
        x="380"
        y="35"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="11"
        fontWeight="600"
        letterSpacing="3"
      >
        ONE RECORD, FOUR PORTALS
      </text>
      {/* Bottom-center caption */}
      <text x="380" y="485" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="11">
        ひとつの「事実」を、役割に応じた最適な形で共有
      </text>

      {/* Decorative corner dots */}
      {[
        [30, 20],
        [730, 20],
        [30, 480],
        [730, 480],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2" fill="rgba(167,139,250,0.5)" />
      ))}
    </svg>
  );
}
