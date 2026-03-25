"use client";

import { ScrollReveal } from "./ScrollReveal";

export function StepList({
  steps,
  accent = "blue",
}: {
  steps: Array<{ step: string; title: string; description: string }>;
  accent?: "blue" | "violet" | "cyan";
}) {
  const accentColors = {
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    violet: "bg-violet-500/10 border-violet-500/20 text-violet-400",
    cyan: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
  };

  return (
    <div className="max-w-3xl mx-auto">
      {steps.map((item, i) => (
        <ScrollReveal key={item.step} variant="fade-up" delay={i * 100}>
          <div className="flex gap-6 md:gap-8 items-start py-8 border-b border-white/[0.06] last:border-b-0">
            <div
              className={`flex-shrink-0 w-14 h-14 rounded-xl border flex items-center justify-center ${accentColors[accent]}`}
            >
              <span className="text-lg font-bold">{item.step}</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{item.title}</h3>
              <p className="mt-2 text-white/65 leading-relaxed">
                {item.description}
              </p>
            </div>
          </div>
        </ScrollReveal>
      ))}
    </div>
  );
}
