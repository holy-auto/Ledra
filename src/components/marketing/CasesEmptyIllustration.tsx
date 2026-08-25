/**
 * /cases empty-state illustration.
 *
 * Abstract frame with a soft inner glow — reads as "this space awaits your
 * story." Placed above the pilot recruitment copy.
 */
export function CasesEmptyIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 220" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="ce-glow" cx="0.5" cy="0.5">
          <stop offset="0%" stopColor="rgba(96,165,250,0.35)" />
          <stop offset="60%" stopColor="rgba(167,139,250,0.08)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="ce-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(96,165,250,0.5)" />
          <stop offset="100%" stopColor="rgba(167,139,250,0.3)" />
        </linearGradient>
      </defs>

      {/* Background glow */}
      <ellipse cx="180" cy="110" rx="140" ry="80" fill="url(#ce-glow)" />

      {/* Outer frame */}
      <rect
        x="60"
        y="40"
        width="240"
        height="140"
        rx="10"
        stroke="url(#ce-frame)"
        strokeWidth="1"
        strokeDasharray="6 4"
        fill="none"
      />

      {/* Inner card (ghost) */}
      <rect
        x="82"
        y="60"
        width="196"
        height="100"
        rx="8"
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.08)"
      />

      {/* Ghost title + lines */}
      <rect x="100" y="80" width="90" height="8" rx="2" fill="rgba(255,255,255,0.18)" />
      <rect x="100" y="98" width="160" height="4" rx="1" fill="rgba(255,255,255,0.08)" />
      <rect x="100" y="108" width="140" height="4" rx="1" fill="rgba(255,255,255,0.08)" />
      <rect x="100" y="118" width="110" height="4" rx="1" fill="rgba(255,255,255,0.08)" />

      {/* Ghost cta chip */}
      <rect x="100" y="134" width="60" height="16" rx="8" fill="rgba(96,165,250,0.12)" stroke="rgba(96,165,250,0.3)" />

      {/* Small sparkles */}
      <circle cx="78" cy="50" r="2" fill="rgba(167,139,250,0.6)" />
      <circle cx="290" cy="40" r="1.5" fill="rgba(96,165,250,0.6)" />
      <circle cx="320" cy="150" r="2" fill="rgba(139,200,255,0.5)" />
      <circle cx="44" cy="160" r="1.5" fill="rgba(167,139,250,0.5)" />
    </svg>
  );
}
