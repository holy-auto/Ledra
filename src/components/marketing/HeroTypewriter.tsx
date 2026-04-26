"use client";

import { useEffect, useRef } from "react";

type Props = {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function HeroTypewriter({ text, speed = 42, startDelay = 1100, className = "" }: Props) {
  const visibleRef = useRef<HTMLSpanElement | null>(null);
  const hiddenRef = useRef<HTMLSpanElement | null>(null);
  const caretRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      if (visibleRef.current) visibleRef.current.textContent = text;
      if (hiddenRef.current) hiddenRef.current.textContent = "";
      if (caretRef.current) caretRef.current.style.display = "none";
      return;
    }

    let raf = 0;
    let timer = 0;
    let startTs = 0;
    let lastLen = -1;
    const total = text.length;

    const step = (now: number) => {
      if (!startTs) startTs = now;
      const elapsed = now - startTs;
      const i = Math.min(total, Math.floor(elapsed / speed));
      if (i !== lastLen) {
        lastLen = i;
        if (visibleRef.current) visibleRef.current.textContent = text.slice(0, i);
        if (hiddenRef.current) hiddenRef.current.textContent = text.slice(i);
      }
      if (i >= total) {
        if (caretRef.current) caretRef.current.style.display = "none";
        return;
      }
      raf = requestAnimationFrame(step);
    };

    timer = window.setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, startDelay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [text, speed, startDelay]);

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span ref={visibleRef} />
      <span ref={hiddenRef} aria-hidden className="invisible">
        {text}
      </span>
      <span
        ref={caretRef}
        aria-hidden
        className="ml-[2px] inline-block h-[0.95em] w-[2px] translate-y-[2px] bg-blue-400"
        style={{ animation: "caret-blink 900ms steps(2) infinite", willChange: "opacity" }}
      />
    </span>
  );
}
