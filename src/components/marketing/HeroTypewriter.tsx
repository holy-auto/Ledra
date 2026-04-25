"use client";

import { useEffect, useState } from "react";

type Props = {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
};

export function HeroTypewriter({ text, speed = 42, startDelay = 1100, className = "" }: Props) {
  const [shown, setShown] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const start = window.setTimeout(() => setStarted(true), startDelay);
    return () => window.clearTimeout(start);
  }, [startDelay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [started, text, speed]);

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span>{shown || " "}</span>
      <span
        aria-hidden
        className="ml-[2px] inline-block h-[0.95em] w-[2px] translate-y-[2px] bg-blue-400"
        style={{ animation: "caret-blink 900ms steps(2) infinite" }}
      />
    </span>
  );
}
