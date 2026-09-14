/**
 * Generic dark-gradient article hero.
 *
 * Used when a blog/news/case entry doesn't supply its own `hero` image in
 * frontmatter. The palette — blue→violet — matches the brand gradient.
 * A tag hash seed lets us subtly vary the composition per article.
 */

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function ArticleHero({
  seed = "ledra",
  tag,
  className = "",
}: {
  seed?: string;
  tag?: string;
  className?: string;
}) {
  const h = hash(seed);
  // Vary the two orb positions per seed
  const orb1X = 20 + (h % 40);
  const orb1Y = 25 + ((h >> 3) % 30);
  const orb2X = 60 + ((h >> 6) % 30);
  const orb2Y = 55 + ((h >> 9) % 25);
  const dotRot = (h >> 12) % 30;

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl ${className}`}>
      <svg
        viewBox="0 0 1200 480"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`ah-bg-${h}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0a0f1a" />
            <stop offset="50%" stopColor="#0b1224" />
            <stop offset="100%" stopColor="#0d0b1e" />
          </linearGradient>
          <radialGradient id={`ah-orb1-${h}`} cx="0.5" cy="0.5">
            <stop offset="0%" stopColor="rgba(96,165,250,0.42)" />
            <stop offset="100%" stopColor="rgba(96,165,250,0)" />
          </radialGradient>
          <radialGradient id={`ah-orb2-${h}`} cx="0.5" cy="0.5">
            <stop offset="0%" stopColor="rgba(167,139,250,0.35)" />
            <stop offset="100%" stopColor="rgba(167,139,250,0)" />
          </radialGradient>
          <pattern id={`ah-grid-${h}`} width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" />
          </pattern>
        </defs>

        <rect width="1200" height="480" fill={`url(#ah-bg-${h})`} />
        <rect width="1200" height="480" fill={`url(#ah-grid-${h})`} opacity="0.5" />

        {/* Orbs */}
        <circle cx={(orb1X / 100) * 1200} cy={(orb1Y / 100) * 480} r="280" fill={`url(#ah-orb1-${h})`} />
        <circle cx={(orb2X / 100) * 1200} cy={(orb2Y / 100) * 480} r="220" fill={`url(#ah-orb2-${h})`} />

        {/* Floating dots */}
        {Array.from({ length: 6 }).map((_, i) => {
          const cx = (h >> (i * 3)) % 1200;
          const cy = (h >> (i * 3 + 1)) % 480;
          const r = 1 + ((h >> (i * 3 + 2)) % 2);
          return <circle key={i} cx={cx} cy={cy} r={r} fill="rgba(139,200,255,0.35)" opacity="0.6" />;
        })}

        {/* Abstract geometric mark (rotated square) */}
        <g transform={`translate(1000 240) rotate(${dotRot})`}>
          <rect x="-40" y="-40" width="80" height="80" stroke="rgba(167,139,250,0.35)" fill="none" strokeWidth="1" />
          <rect x="-20" y="-20" width="40" height="40" stroke="rgba(96,165,250,0.28)" fill="none" strokeWidth="1" />
        </g>

        {/* Top-left tag chip */}
        {tag && (
          <>
            <rect
              x="40"
              y="36"
              width={tag.length * 9 + 28}
              height="28"
              rx="14"
              fill="rgba(96,165,250,0.12)"
              stroke="rgba(96,165,250,0.28)"
            />
            <text x={54} y="55" fill="rgba(147,197,253,0.95)" fontSize="12" fontWeight="600" letterSpacing="2">
              {tag.toUpperCase()}
            </text>
          </>
        )}

        {/* Subtle wordmark */}
        <text x="1160" y="462" textAnchor="end" fill="rgba(255,255,255,0.15)" fontSize="11" letterSpacing="3">
          LEDRA
        </text>
      </svg>
    </div>
  );
}
