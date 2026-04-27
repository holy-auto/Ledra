"use client";

import { useEffect, useRef, useState } from "react";

type Step = {
  step: string;
  title: string;
  description: string;
};

type Props = {
  steps: readonly Step[];
  intervalMs?: number;
};

export function AnimatedStepper({ steps, intervalMs = 1100 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setStarted(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.25 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      setActive((a) => (a >= steps.length ? a : a + 1));
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [started, steps.length, intervalMs]);

  const fillPct = steps.length <= 1 ? 0 : (Math.min(active, steps.length - 1) / (steps.length - 1)) * 100;

  return (
    <div ref={containerRef} className="relative max-w-3xl mx-auto">
      {/* Vertical progress track (left side) */}
      <div className="absolute left-7 top-7 bottom-7 w-px bg-white/[0.06] pointer-events-none" aria-hidden />
      <div
        className="absolute left-7 top-7 w-px bg-gradient-to-b from-blue-400 via-violet-400 to-blue-400 pointer-events-none transition-[height] duration-[1100ms] ease-out"
        style={{ height: `calc((100% - 3.5rem) * ${fillPct / 100})` }}
        aria-hidden
      />

      <ol className="relative">
        {steps.map((item, i) => {
          const state: "done" | "current" | "todo" = i < active ? "done" : i === active ? "current" : "todo";
          return (
            <li key={item.step} className="flex gap-6 md:gap-8 items-start py-7">
              {/* Step dot */}
              <span
                className="relative flex-shrink-0 w-14 h-14 rounded-xl flex items-center justify-center border transition-all duration-500"
                style={{
                  background:
                    state === "done"
                      ? "rgba(59,130,246,0.22)"
                      : state === "current"
                        ? "rgba(59,130,246,0.12)"
                        : "rgba(255,255,255,0.02)",
                  borderColor:
                    state === "done"
                      ? "rgba(96,165,250,0.55)"
                      : state === "current"
                        ? "rgba(96,165,250,0.35)"
                        : "rgba(255,255,255,0.08)",
                }}
              >
                {state === "done" ? (
                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-300" aria-hidden>
                    <path
                      d="M5 12l5 5L20 7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray={1}
                      style={{ animation: "path-draw 520ms ease-out both" }}
                    />
                  </svg>
                ) : (
                  <span className={`text-lg font-bold ${state === "current" ? "text-blue-300" : "text-white/75"}`}>
                    {item.step}
                  </span>
                )}
                {state === "current" && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-xl border border-blue-400/50"
                    style={{ animation: "stepper-pulse 1.6s ease-out infinite" }}
                  />
                )}
              </span>

              <div className="flex-1 pt-1">
                <h3
                  className={`text-lg font-bold transition-colors duration-500 ${
                    state === "todo" ? "text-white/80" : "text-white"
                  }`}
                >
                  {item.title}
                </h3>
                <p
                  className={`mt-2 leading-relaxed transition-colors duration-500 ${
                    state === "todo" ? "text-white/70" : "text-white/80"
                  }`}
                >
                  {item.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
