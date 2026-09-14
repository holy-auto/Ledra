/**
 * Polygon anchoring flow diagram.
 *
 * Shows the four-step verification chain:
 *   1. 施工店が証明書を発行
 *   2. サーバーがコンテンツハッシュを計算
 *   3. Polygon コントラクトに anchoring
 *   4. 第三者が独立に検証
 */
export function PolygonAnchoringDiagram({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 820 360"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Polygon anchoring のフロー図"
    >
      <defs>
        <linearGradient id="pa-node" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(96,165,250,0.24)" />
          <stop offset="100%" stopColor="rgba(167,139,250,0.12)" />
        </linearGradient>
        <linearGradient id="pa-chain" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(167,139,250,0.28)" />
          <stop offset="100%" stopColor="rgba(96,165,250,0.16)" />
        </linearGradient>
        <marker
          id="pa-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 Z" fill="rgba(96,165,250,0.55)" />
        </marker>
      </defs>

      {/* Arrows */}
      <line
        x1="165"
        y1="100"
        x2="240"
        y2="100"
        stroke="rgba(96,165,250,0.4)"
        strokeWidth="2"
        markerEnd="url(#pa-arrow)"
      />
      <line
        x1="375"
        y1="100"
        x2="460"
        y2="100"
        stroke="rgba(96,165,250,0.4)"
        strokeWidth="2"
        markerEnd="url(#pa-arrow)"
      />
      <line
        x1="555"
        y1="145"
        x2="555"
        y2="200"
        stroke="rgba(96,165,250,0.4)"
        strokeWidth="2"
        markerEnd="url(#pa-arrow)"
      />
      <line
        x1="465"
        y1="260"
        x2="375"
        y2="260"
        stroke="rgba(96,165,250,0.4)"
        strokeWidth="2"
        markerEnd="url(#pa-arrow)"
      />
      <line
        x1="240"
        y1="260"
        x2="165"
        y2="260"
        stroke="rgba(96,165,250,0.4)"
        strokeWidth="2"
        markerEnd="url(#pa-arrow)"
      />

      {/* Node 1 — 施工店 */}
      <g>
        <rect x="20" y="55" width="145" height="90" rx="14" fill="url(#pa-node)" stroke="rgba(255,255,255,0.14)" />
        <text x="92" y="90" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">
          施工店
        </text>
        <text x="92" y="112" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          証明書を発行
        </text>
        <text x="92" y="128" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
          写真・施工内容
        </text>
      </g>

      {/* Node 2 — ハッシュ計算 */}
      <g>
        <rect x="240" y="55" width="135" height="90" rx="14" fill="url(#pa-node)" stroke="rgba(255,255,255,0.14)" />
        <text x="307" y="90" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">
          SHA-256
        </text>
        <text x="307" y="112" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          ハッシュを計算
        </text>
        <text x="307" y="128" textAnchor="middle" fill="rgba(167,139,250,0.7)" fontSize="10" fontFamily="monospace">
          0xa4f1…
        </text>
      </g>

      {/* Node 3 — Polygon */}
      <g>
        <rect x="460" y="55" width="190" height="90" rx="14" fill="url(#pa-chain)" stroke="rgba(167,139,250,0.35)" />
        <text x="555" y="90" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">
          Polygon Contract
        </text>
        <text x="555" y="112" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          トランザクションに刻印
        </text>
        <text x="555" y="128" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
          Block #12,345,678
        </text>
      </g>

      {/* Node 4 — Explorer (persistent record) */}
      <g>
        <rect x="460" y="200" width="190" height="90" rx="14" fill="url(#pa-chain)" stroke="rgba(167,139,250,0.35)" />
        <text x="555" y="235" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">
          パブリック台帳に固定
        </text>
        <text x="555" y="257" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          誰でも閲覧可能・書換不可
        </text>
        <text x="555" y="273" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
          第三者が独立に検証できる
        </text>
      </g>

      {/* Node 5 — 検証: 再計算 */}
      <g>
        <rect x="240" y="215" width="135" height="90" rx="14" fill="url(#pa-node)" stroke="rgba(255,255,255,0.14)" />
        <text x="307" y="250" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">
          ハッシュ再計算
        </text>
        <text x="307" y="272" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          受領した証明書から
        </text>
        <text x="307" y="288" textAnchor="middle" fill="rgba(167,139,250,0.7)" fontSize="10" fontFamily="monospace">
          一致 → 真正
        </text>
      </g>

      {/* Node 6 — 保険会社 / 第三者 */}
      <g>
        <rect x="20" y="215" width="145" height="90" rx="14" fill="url(#pa-node)" stroke="rgba(255,255,255,0.14)" />
        <text x="92" y="250" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="700">
          保険会社
        </text>
        <text x="92" y="272" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="11">
          証明書を受領
        </text>
        <text x="92" y="288" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">
          真贋を即検証
        </text>
      </g>

      {/* Top label */}
      <text
        x="405"
        y="30"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="11"
        fontWeight="600"
        letterSpacing="2"
      >
        ISSUANCE
      </text>
      {/* Bottom label */}
      <text
        x="405"
        y="340"
        textAnchor="middle"
        fill="rgba(255,255,255,0.5)"
        fontSize="11"
        fontWeight="600"
        letterSpacing="2"
      >
        VERIFICATION
      </text>

      {/* Side glows */}
      <circle cx="740" cy="100" r="60" fill="rgba(96,165,250,0.06)" />
      <circle cx="740" cy="260" r="50" fill="rgba(167,139,250,0.06)" />
    </svg>
  );
}
