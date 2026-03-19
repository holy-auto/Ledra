"use client";

import { useEffect, useState } from "react";

const LAUNCH_DATE = new Date("2026-04-01T00:00:00+09:00");

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calcTimeLeft(): TimeLeft {
  const diff = LAUNCH_DATE.getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function Digit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-24 sm:w-28 sm:h-32 md:w-32 md:h-36 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-[0_4px_30px_rgba(0,0,0,0.3)]">
        <span className="text-4xl sm:text-5xl md:text-6xl font-bold tabular-nums text-white">
          {String(value).padStart(2, "0")}
        </span>
      </div>
      <span className="mt-3 text-xs sm:text-sm text-white/40 font-medium tracking-widest uppercase">
        {label}
      </span>
    </div>
  );
}

export function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTimeLeft(calcTimeLeft());
    const id = setInterval(() => setTimeLeft(calcTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!timeLeft) {
    // SSR / hydration placeholder
    return (
      <div className="flex items-center justify-center gap-3 sm:gap-5 md:gap-6">
        {["Days", "Hours", "Min", "Sec"].map((label) => (
          <Digit key={label} value={0} label={label} />
        ))}
      </div>
    );
  }

  const launched = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0;

  if (launched) {
    return (
      <div className="text-3xl md:text-5xl font-bold text-white animate-[hero-fade-up_0.8s_ease-out_both]">
        サービス公開しました！
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5 md:gap-6">
      <Digit value={timeLeft.days} label="Days" />
      <div className="text-3xl md:text-4xl font-bold text-white/20 self-start mt-6 sm:mt-8 md:mt-10">:</div>
      <Digit value={timeLeft.hours} label="Hours" />
      <div className="text-3xl md:text-4xl font-bold text-white/20 self-start mt-6 sm:mt-8 md:mt-10">:</div>
      <Digit value={timeLeft.minutes} label="Min" />
      <div className="text-3xl md:text-4xl font-bold text-white/20 self-start mt-6 sm:mt-8 md:mt-10">:</div>
      <Digit value={timeLeft.seconds} label="Sec" />
    </div>
  );
}
