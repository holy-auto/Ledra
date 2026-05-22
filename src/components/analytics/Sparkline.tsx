/**
 * Lightweight SVG sparkline — no chart library dependency.
 *
 * Renders a normalized line through `values`. Missing values
 * (null) break the line. Designed to embed inside table cells
 * so it stays readable at 60-120px widths.
 */

type Props = {
  values: Array<number | null>;
  width?: number;
  height?: number;
  strokeClassName?: string;
  fillClassName?: string;
  showDots?: boolean;
  ariaLabel?: string;
};

export default function Sparkline({
  values,
  width = 120,
  height = 32,
  strokeClassName = "stroke-zinc-700",
  fillClassName = "fill-zinc-200",
  showDots = false,
  ariaLabel,
}: Props) {
  if (values.length === 0) {
    return (
      <svg width={width} height={height} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} className="stroke-zinc-300" strokeWidth={1} />
      </svg>
    );
  }

  const numeric = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const min = numeric.length ? Math.min(...numeric) : 0;
  const max = numeric.length ? Math.max(...numeric) : 1;
  const range = max - min || 1;
  const padding = 2;

  const xStep = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const yScale = (v: number) => height - padding - ((v - min) / range) * (height - padding * 2);

  // Build path with gap handling: null breaks the line.
  let path = "";
  let inSegment = false;
  values.forEach((v, i) => {
    const x = padding + xStep * i;
    if (v === null || !Number.isFinite(v)) {
      inSegment = false;
      return;
    }
    const y = yScale(v);
    if (!inSegment) {
      path += `M${x.toFixed(1)},${y.toFixed(1)}`;
      inSegment = true;
    } else {
      path += `L${x.toFixed(1)},${y.toFixed(1)}`;
    }
  });

  // Area under line (only when fully numeric for simplicity)
  const allNumeric = values.every((v) => v !== null && Number.isFinite(v));
  const areaPath = allNumeric
    ? `${path} L${(padding + xStep * (values.length - 1)).toFixed(1)},${(height - padding).toFixed(1)} L${padding.toFixed(1)},${(height - padding).toFixed(1)} Z`
    : null;

  return (
    <svg width={width} height={height} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
      {areaPath ? <path d={areaPath} className={fillClassName} opacity={0.4} /> : null}
      <path d={path} className={strokeClassName} fill="none" strokeWidth={1.5} strokeLinejoin="round" />
      {showDots
        ? values.map((v, i) =>
            v === null || !Number.isFinite(v) ? null : (
              <circle
                key={i}
                cx={padding + xStep * i}
                cy={yScale(v)}
                r={1.5}
                className={strokeClassName}
                fill="currentColor"
              />
            ),
          )
        : null}
    </svg>
  );
}
