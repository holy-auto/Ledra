interface SkeletonProps {
  className?: string;
  /** Width in Tailwind class, e.g. "w-24", "w-full" */
  width?: string;
  /** Height in Tailwind class, e.g. "h-4", "h-8" */
  height?: string;
  /** Render as a circle */
  circle?: boolean;
}

export default function Skeleton({ className = "", width = "w-full", height = "h-4", circle = false }: SkeletonProps) {
  return (
    <div className={`skeleton ${width} ${height} ${circle ? "rounded-full" : ""} ${className}`} aria-hidden="true" />
  );
}

/** Multiple skeleton lines for text blocks */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "w-2/3" : "w-full"} height="h-4" />
      ))}
    </div>
  );
}
