"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LineDef = {
  text: string;
  speed: number;
  pauseAfter: number;
  caret?: boolean;
  caretClassName?: string;
};

const LINES: LineDef[] = [
  // 0..2 — intro: 現場の課題
  { text: "腕のいい職人がいる。丁寧な仕事をしている。", speed: 36, pauseAfter: 280 },
  { text: "でも、その技術は施工が終わった瞬間に見えなくなる。", speed: 32, pauseAfter: 380 },
  {
    text: "写真は個人のスマホに埋もれ、記録は紙のファイルに閉じられ、品質の証明は、口約束と経験則に頼っている。",
    speed: 24,
    pauseAfter: 800,
  },
  // 3..5 — transition: 問いかけ
  { text: "もし、一件一件の施工が「証明」として残ったら。", speed: 30, pauseAfter: 320 },
  { text: "もし、その証明が施工店の信用になったら。", speed: 30, pauseAfter: 320 },
  { text: "もし、その信用が保険査定や顧客選択の判断材料になったら。", speed: 30, pauseAfter: 700 },
  // 6 — pivot
  {
    text: "現場の技術は、もっと正しく評価されるはずだ。",
    speed: 50,
    caret: true,
    caretClassName: "bg-white/80",
    pauseAfter: 700,
  },
  // 7..10 — chain
  { text: "一件の施工記録が、証明になる。", speed: 36, pauseAfter: 240 },
  { text: "証明が、信頼になる。", speed: 36, pauseAfter: 240 },
  { text: "信頼が、つながりになる。", speed: 36, pauseAfter: 240 },
  { text: "つながりが、業界の基盤になる。", speed: 36, pauseAfter: 600 },
  // 11 — conclusion
  {
    text: "記録を、業界の共通言語にする。",
    speed: 60,
    caret: true,
    caretClassName: "bg-blue-400",
    pauseAfter: 0,
  },
];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function TypeLine({ def, active, onComplete }: { def: LineDef; active: boolean; onComplete: () => void }) {
  // DOM を直接更新して React の再レンダリングを最小化
  const visibleRef = useRef<HTMLSpanElement | null>(null);
  const hiddenRef = useRef<HTMLSpanElement | null>(null);
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active || completedRef.current) return;

    // reduced-motion ユーザーには即時表示
    if (prefersReducedMotion()) {
      if (visibleRef.current) visibleRef.current.textContent = def.text;
      if (hiddenRef.current) hiddenRef.current.textContent = "";
      if (caretRef.current) caretRef.current.style.display = "none";
      completedRef.current = true;
      onCompleteRef.current();
      return;
    }

    let raf = 0;
    let startTs = 0;
    let lastLen = -1;
    const total = def.text.length;
    const speed = def.speed;

    const step = (now: number) => {
      if (!startTs) startTs = now;
      const elapsed = now - startTs;
      const i = Math.min(total, Math.floor(elapsed / speed));
      if (i !== lastLen) {
        lastLen = i;
        // 直接 DOM を書き換え（React 再レンダーをスキップ）
        if (visibleRef.current) visibleRef.current.textContent = def.text.slice(0, i);
        if (hiddenRef.current) hiddenRef.current.textContent = def.text.slice(i);
      }
      if (i >= total) {
        if (caretRef.current) caretRef.current.style.display = "none";
        completedRef.current = true;
        onCompleteRef.current();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, def.text, def.speed]);

  return (
    <>
      <span ref={visibleRef} />
      <span ref={hiddenRef} aria-hidden className="invisible">
        {def.text}
      </span>
      {def.caret && (
        <span
          ref={caretRef}
          aria-hidden
          className={`ml-[2px] inline-block h-[0.95em] w-[2px] translate-y-[2px] ${def.caretClassName ?? "bg-blue-400"}`}
          style={{
            animation: "caret-blink 900ms steps(2) infinite",
            display: active ? "inline-block" : "none",
            willChange: "opacity",
          }}
        />
      )}
    </>
  );
}

export function NarrativeTypewriter() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // reduced-motion 環境では一気に全行を完了状態に
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveIdx(LINES.length);
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActiveIdx((cur) => (cur === -1 ? 0 : cur));
            obs.disconnect();
          }
        }
      },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const advance = useCallback((completedIdx: number) => {
    if (completedIdx + 1 >= LINES.length) return;
    const pause = LINES[completedIdx].pauseAfter;
    window.setTimeout(() => {
      setActiveIdx((cur) => (cur > completedIdx ? cur : completedIdx + 1));
    }, pause);
  }, []);

  const lineProps = (idx: number) => ({
    def: LINES[idx],
    active: activeIdx >= idx,
    onComplete: () => advance(idx),
  });

  return (
    <div ref={containerRef} className="max-w-3xl mx-auto">
      {/* 導入 — 現場の課題 */}
      <div className="space-y-5 text-[1.125rem] md:text-[1.25rem] leading-[1.85] text-white/50">
        <p>
          <TypeLine {...lineProps(0)} />
        </p>
        <p>
          <TypeLine {...lineProps(1)} />
        </p>
        <p className="text-white/35">
          <TypeLine {...lineProps(2)} />
        </p>
      </div>

      {/* 転換 — 問いかけ */}
      <div className="mt-16 md:mt-20 space-y-4 text-[1.125rem] md:text-[1.25rem] leading-[1.85] text-white/60">
        <p>
          <TypeLine {...lineProps(3)} />
        </p>
        <p>
          <TypeLine {...lineProps(4)} />
        </p>
        <p>
          <TypeLine {...lineProps(5)} />
        </p>
      </div>

      {/* ピボット */}
      <p className="mt-12 md:mt-16 text-[1.25rem] md:text-[1.5rem] font-bold leading-[1.6] text-white">
        <TypeLine {...lineProps(6)} />
      </p>

      {/* チェーン — 記録→証明→信頼→業界基盤 */}
      <div className="mt-20 md:mt-24 flex flex-col gap-0">
        {[7, 8, 9, 10].map((idx) => (
          <div key={idx} className="flex items-center gap-4 py-3">
            <div
              className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-400 to-violet-400 flex-shrink-0 transition-opacity duration-500"
              style={{ opacity: activeIdx >= idx ? 1 : 0.25 }}
            />
            <span className="text-[1.125rem] md:text-[1.25rem] font-medium text-white/70">
              <TypeLine {...lineProps(idx)} />
            </span>
          </div>
        ))}
      </div>

      {/* 結句 */}
      <p className="mt-12 text-[1.375rem] md:text-[1.75rem] font-bold tracking-tight bg-gradient-to-r from-[#60a5fa] via-[#a78bfa] to-[#60a5fa] bg-clip-text text-transparent bg-[length:200%_auto]">
        <TypeLine {...lineProps(11)} />
      </p>
    </div>
  );
}
