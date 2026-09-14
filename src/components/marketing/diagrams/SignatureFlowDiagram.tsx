/**
 * Electronic signature flow diagram.
 *
 * Shows the five-step signing flow:
 *   1. 依頼者がドキュメントをアップロード
 *   2. 署名依頼メールが送信される
 *   3. 署名者がブラウザで内容確認・OTP認証
 *   4. ECDSA P-256 署名を生成・付与
 *   5. 署名済みPDFを双方に保管
 */
export function SignatureFlowDiagram({ className = "" }: { className?: string }) {
  const steps = [
    { label: "ドキュメント\nアップロード", sub: "依頼者", hue: "rgba(96,165,250," },
    { label: "署名依頼\nメール送信", sub: "Ledra", hue: "rgba(139,200,255," },
    { label: "内容確認\nOTP認証", sub: "署名者", hue: "rgba(96,165,250," },
    { label: "ECDSA P-256\n署名生成", sub: "サーバー", hue: "rgba(167,139,250," },
    { label: "署名済みPDF\n双方に保管", sub: "Ledra", hue: "rgba(167,139,250," },
  ];

  const nodeW = 108;
  const nodeH = 80;
  const gap = 52;
  const totalW = steps.length * nodeW + (steps.length - 1) * gap;
  const startX = (820 - totalW) / 2;
  const cy = 160;

  return (
    <svg
      viewBox="0 0 820 320"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="電子署名フローの図"
    >
      <defs>
        <marker
          id="sig-arrow"
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

      {/* Top caption */}
      <text
        x="410"
        y="36"
        textAnchor="middle"
        fill="rgba(255,255,255,0.45)"
        fontSize="11"
        fontWeight="600"
        letterSpacing="3"
      >
        SIGNATURE FLOW
      </text>

      {/* Connectors */}
      {steps.slice(0, -1).map((_, i) => {
        const x1 = startX + i * (nodeW + gap) + nodeW;
        const x2 = x1 + gap;
        return (
          <line
            key={i}
            x1={x1}
            y1={cy}
            x2={x2}
            y2={cy}
            stroke="rgba(96,165,250,0.35)"
            strokeWidth="2"
            markerEnd="url(#sig-arrow)"
          />
        );
      })}

      {/* Nodes */}
      {steps.map((s, i) => {
        const x = startX + i * (nodeW + gap);
        const lines = s.label.split("\n");
        return (
          <g key={i}>
            <rect
              x={x}
              y={cy - nodeH / 2}
              width={nodeW}
              height={nodeH}
              rx="14"
              fill={`${s.hue}0.18)`}
              stroke={`${s.hue}0.38)`}
            />
            {/* Step number */}
            <text
              x={x + nodeW / 2}
              y={cy - nodeH / 2 + 16}
              textAnchor="middle"
              fill={`${s.hue}0.7)`}
              fontSize="10"
              fontWeight="700"
            >
              {String(i + 1).padStart(2, "0")}
            </text>
            {/* Label lines */}
            {lines.map((line, li) => (
              <text
                key={li}
                x={x + nodeW / 2}
                y={cy - 6 + li * 16}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="12"
                fontWeight="700"
              >
                {line}
              </text>
            ))}
            {/* Sub-label */}
            <text
              x={x + nodeW / 2}
              y={cy + nodeH / 2 - 10}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontSize="10"
            >
              {s.sub}
            </text>
          </g>
        );
      })}

      {/* Bottom note */}
      <text x="410" y="295" textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="11">
        署名時刻・IPアドレス・OTP検証結果を監査ログに記録
      </text>

      {/* Side glows */}
      <circle cx="730" cy="160" r="60" fill="rgba(167,139,250,0.05)" />
      <circle cx="90" cy="160" r="50" fill="rgba(96,165,250,0.05)" />
    </svg>
  );
}
