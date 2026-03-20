"use client";

import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Skip animation for users who prefer reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        isVisible
          ? {
              animationName: variantToKeyframes[variant],
              animationDuration: `${duration}ms`,
              animationDelay: `${delay}ms`,
              animationFillMode: "both",
              animationTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }
          : { opacity: 0 }
      }
    >
      {children}
    </div>
  );
}
