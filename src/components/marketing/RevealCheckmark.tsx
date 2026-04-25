"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  className?: string;
  size?: number;
};

export function RevealCheckmark({ className = "", size = 16 }: Props) {
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setDrawn(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <span ref={wrapRef} className={`inline-flex items-center justify-center ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          style={{
            strokeDashoffset: drawn ? 0 : 1,
            transition: "stroke-dashoffset 700ms cubic-bezier(0.65, 0, 0.35, 1)",
            opacity: 0.75,
          }}
        />
        <path
          d="M7.5 12.5L10.8 15.8L16.8 9"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{
            strokeDashoffset: drawn ? 0 : 1,
            transition: "stroke-dashoffset 520ms 600ms cubic-bezier(0.65, 0, 0.35, 1)",
          }}
        />
      </svg>
    </span>
  );
}
