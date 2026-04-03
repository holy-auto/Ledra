/**
 * ScrollReveal — Server Component
 *
 * CSS アニメーションのみで動作。IntersectionObserver は不使用。
 * "use client" を一切含まないため、これを import するコンポーネントは
 * Server Component のままでいられる。
 *
 * アニメーションは globals.css に定義済みの @keyframes を使用:
 *   hero-fade-up / hero-fade-in / scroll-fade-left /
 *   scroll-fade-right / scroll-scale-up / scroll-blur-in
 */

type AnimationVariant = "fade-up" | "fade-in" | "fade-left" | "fade-right" | "scale-up" | "blur-in";

const variantToKeyframes: Record<AnimationVariant, string> = {
  "fade-up": "hero-fade-up",
  "fade-in": "hero-fade-in",
  "fade-left": "scroll-fade-left",
  "fade-right": "scroll-fade-right",
  "scale-up": "scroll-scale-up",
  "blur-in": "scroll-blur-in",
};

export function ScrollReveal({
  children,
  variant = "fade-up",
  delay = 0,
  duration = 700,
  className = "",
}: {
  children: React.ReactNode;
  variant?: AnimationVariant;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        animationName: variantToKeyframes[variant],
        animationDuration: `${duration}ms`,
        animationDelay: `${delay}ms`,
        animationFillMode: "both",
        animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}
