"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  text: string;
  speed?: number;
  startDelay?: number;
  caret?: boolean;
  caretClassName?: string;
  className?: string;
  threshold?: number;
};

/**
 * Scroll-triggered typewriter.
 *
 * - 要素がビューポートに入った瞬間に startDelay 経過後タイプ開始
 * - レイアウトシフトを防ぐため未表示分を invisible で確保
 */
export function ScrollTypewriter({
  text,
  speed = 32,
  startDelay = 0,
  caret = false,
  caretClassName = "",
  className = "",
  threshold = 0.4,
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState("");
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
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
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  useEffect(() => {
    if (!started) return;
    let intervalId = 0;
    const startTimer = window.setTimeout(() => {
      let i = 0;
      intervalId = window.setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) {
          window.clearInterval(intervalId);
          setDone(true);
        }
      }, speed);
    }, startDelay);
    return () => {
      window.clearTimeout(startTimer);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [started, text, speed, startDelay]);

  return (
    <span ref={ref} className={className}>
      <span>{shown}</span>
      <span aria-hidden className="invisible">
        {text.slice(shown.length)}
      </span>
      {caret && started && !done && (
        <span
          aria-hidden
          className={`ml-[2px] inline-block h-[0.95em] w-[2px] translate-y-[2px] ${caretClassName || "bg-blue-400"}`}
          style={{ animation: "caret-blink 900ms steps(2) infinite" }}
        />
      )}
    </span>
  );
}
