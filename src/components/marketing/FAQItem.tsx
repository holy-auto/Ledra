"use client";

import { useState } from "react";

export function FAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/[0.06]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left gap-4 group"
      >
        <span className="text-[0.938rem] font-medium text-white/80 group-hover:text-white transition-colors">
          {question}
        </span>
        <svg
          className={`w-4 h-4 text-white/40 flex-shrink-0 transition-transform duration-300 ease-out ${open ? "rotate-45" : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="8" y1="2" x2="8" y2="14" />
          <line x1="2" y1="8" x2="14" y2="8" />
        </svg>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <p className="pb-6 text-[0.938rem] leading-[1.75] text-white/60">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}
