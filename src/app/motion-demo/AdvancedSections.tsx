"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./motion-demo.module.css";

// ═══════════════════════════════════════════════════
// Section wrapper (shared layout)
// ═══════════════════════════════════════════════════
function Section({
  id,
  tag,
  title,
  description,
  children,
}: {
  id: string;
  tag: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className="section-tag">{tag}</span>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <p className={styles.sectionDesc}>{description}</p>
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

// ═══════════════════════════════════════════════════
// 07 · TEXT — Char split / Shimmer / Number flip / Scramble
// ═══════════════════════════════════════════════════
function CharSplit({ text }: { text: string }) {
  return (
    <div className={styles.charSplit}>
      {[...text].map((ch, i) => (
        <span key={i} className={styles.charSplitChar} style={{ animationDelay: `${i * 45}ms` }}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </div>
  );
}

function ShimmerText({ text }: { text: string }) {
  return <span className={styles.shimmerText}>{text}</span>;
}

function NumberFlip({ value }: { value: number }) {
  const digits = String(value).padStart(5, "0").split("");
  return (
    <div className={styles.flipDigits}>
      {digits.map((d, i) => (
        <FlipDigit key={i} digit={Number(d)} />
      ))}
    </div>
  );
}

function FlipDigit({ digit }: { digit: number }) {
  const [prev, setPrev] = useState(digit);
  const [flipping, setFlipping] = useState(false);
  useEffect(() => {
    if (digit === prev) return;
    setFlipping(true);
    const t = window.setTimeout(() => {
      setPrev(digit);
      setFlipping(false);
    }, 400);
    return () => window.clearTimeout(t);
  }, [digit, prev]);
  return (
    <span className={`${styles.flipDigit} ${flipping ? styles.flipDigitOn : ""}`}>
      <span className={styles.flipDigitTop}>{prev}</span>
      <span className={styles.flipDigitBottom}>{digit}</span>
    </span>
  );
}

const SCRAMBLE_CHARS = "アイウエオカキクケコサシスABCDEFGHIJK0123456789";
function ScrambleText({ target }: { target: string }) {
  const [output, setOutput] = useState(target);
  const run = () => {
    let frame = 0;
    const total = 24;
    const id = window.setInterval(() => {
      frame += 1;
      const progress = frame / total;
      const out = [...target]
        .map((ch, i) => {
          const revealAt = i / target.length;
          if (progress >= revealAt + 0.12) return ch;
          if (ch === " ") return " ";
          return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        })
        .join("");
      setOutput(out);
      if (frame >= total) {
        window.clearInterval(id);
        setOutput(target);
      }
    }, 55);
  };
  return (
    <button type="button" className={styles.scrambleBtn} onClick={run}>
      <span className={styles.scrambleText}>{output}</span>
    </button>
  );
}

function TextSection() {
  const [count, setCount] = useState(1234);
  useEffect(() => {
    const id = window.setInterval(() => {
      setCount((n) => n + Math.floor(Math.random() * 30) - 10);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);
  return (
    <Section
      id="text"
      tag="07 · Text"
      title="テキストエフェクト"
      description="文字単位で動かして視線を惹く。ロゴやヘッドラインで効く。"
    >
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>文字単位スプリット</p>
          <CharSplit text="Ledra" />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>シマーテキスト</p>
          <ShimmerText text="AI-Powered" />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>フリップ数字</p>
          <NumberFlip value={Math.abs(count)} />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>スクランブル（クリック）</p>
          <ScrambleText target="VERIFIED A-0421" />
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 08 · PHYSICS — Magnetic / Elastic drag
// ═══════════════════════════════════════════════════
function MagneticButton() {
  const ref = useRef<HTMLButtonElement | null>(null);
  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`;
  };
  const reset = () => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0,0)";
  };
  return (
    <button ref={ref} type="button" className={styles.magneticBtn} onMouseMove={onMove} onMouseLeave={reset}>
      Hover me
    </button>
  );
}

function ElasticDrag() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true);
    startRef.current = { x: e.clientX, y: e.clientY, offsetX: pos.x, offsetY: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPos({
      x: startRef.current.offsetX + (e.clientX - startRef.current.x),
      y: startRef.current.offsetY + (e.clientY - startRef.current.y),
    });
  };
  const onUp = () => {
    setDragging(false);
    setPos({ x: 0, y: 0 });
  };
  return (
    <div className={styles.dragStage}>
      <div
        className={styles.dragBall}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          transition: dragging ? "none" : "transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        ドラッグ
      </div>
    </div>
  );
}

function PhysicsSection() {
  return (
    <Section
      id="physics"
      tag="08 · Physics"
      title="物理ベース"
      description="バネ・慣性・磁力。指先に追従する質感が「触れる」体験をつくる。"
    >
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>マグネティックボタン</p>
          <div className={styles.centerBox}>
            <MagneticButton />
          </div>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>エラスティックドラッグ</p>
          <ElasticDrag />
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 09 · SCROLL — Parallax / Progress bar
// ═══════════════════════════════════════════════════
function ScrollProgressBar() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const update = () => {
      const scrolled = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? (scrolled / max) * 100 : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <div className={styles.scrollProgress} style={{ width: `${p}%` }} />;
}

function ParallaxDemo() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [y, setY] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      setY(center * -0.15);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={ref} className={styles.parallax}>
      <div className={styles.parallaxBack} style={{ transform: `translateY(${y * 0.4}px)` }} />
      <div className={styles.parallaxMid} style={{ transform: `translateY(${y * 0.7}px)` }} />
      <div className={styles.parallaxFront} style={{ transform: `translateY(${y}px)` }}>
        <span>Parallax</span>
      </div>
    </div>
  );
}

function HorizontalScroll() {
  return (
    <div className={styles.hScrollWrap}>
      <div className={styles.hScroll}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <div key={n} className={styles.hScrollItem}>
            <span>#{String(n).padStart(2, "0")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScrollSection() {
  return (
    <Section
      id="scroll"
      tag="09 · Scroll"
      title="スクロール連動"
      description="ページ上部に進捗バー、セクションにパララックスと横スクロール。"
    >
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>パララックス</p>
          <ParallaxDemo />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>横スクロール</p>
          <HorizontalScroll />
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 10 · SVG — Icon morph / Wave
// ═══════════════════════════════════════════════════
function ThemeMorph() {
  const [dark, setDark] = useState(false);
  return (
    <button type="button" className={styles.themeMorph} onClick={() => setDark((v) => !v)} aria-label="toggle theme">
      <svg viewBox="0 0 24 24" className={`${styles.morphSvg} ${dark ? styles.morphDark : ""}`}>
        <path
          className={styles.morphPath}
          d={
            dark
              ? "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
              : "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"
          }
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </button>
  );
}

function WaveLine() {
  return (
    <svg className={styles.wave} viewBox="0 0 240 80" preserveAspectRatio="none" aria-hidden>
      <path
        d="M0 40 Q 30 10 60 40 T 120 40 T 180 40 T 240 40"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <animate
          attributeName="d"
          dur="3s"
          repeatCount="indefinite"
          values="M0 40 Q 30 10 60 40 T 120 40 T 180 40 T 240 40;
                  M0 40 Q 30 70 60 40 T 120 40 T 180 40 T 240 40;
                  M0 40 Q 30 10 60 40 T 120 40 T 180 40 T 240 40"
        />
      </path>
    </svg>
  );
}

function LogoDraw({ play }: { play: number }) {
  return (
    <svg key={play} className={styles.logoDraw} viewBox="0 0 120 40" aria-hidden>
      <path
        d="M10 30 L10 10 M10 30 L26 30 M40 10 L40 30 L56 30 M70 30 L70 10 L86 10 M70 20 L84 20 M100 10 L100 30"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={1}
        className={styles.logoPath}
      />
    </svg>
  );
}

function SvgSection() {
  const [play, setPlay] = useState(0);
  return (
    <Section
      id="svg"
      tag="10 · SVG"
      title="SVG モーフ & 描画"
      description="アイコンの形が変わる、線が伸びる。ベクターだから拡大しても綺麗。"
    >
      <div className={styles.grid3}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>アイコンモーフ（sun↔moon）</p>
          <div className={styles.centerBox}>
            <ThemeMorph />
          </div>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>波線アニメーション</p>
          <div className={styles.centerBox} style={{ color: "var(--accent-blue)" }}>
            <WaveLine />
          </div>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>ロゴドロー</p>
          <div className={styles.centerBox} style={{ color: "var(--accent-violet)" }}>
            <LogoDraw play={play} />
          </div>
          <div className={styles.centerBox} style={{ marginTop: "0.5rem" }}>
            <button type="button" className="btn-secondary" data-size="sm" onClick={() => setPlay((n) => n + 1)}>
              再生
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 11 · 3D — Flip card / Isometric stack
// ═══════════════════════════════════════════════════
function FlipCard() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={`${styles.flipCard} ${flipped ? styles.flipCardOn : ""}`} onClick={() => setFlipped((v) => !v)}>
      <div className={styles.flipCardInner}>
        <div className={styles.flipFront}>
          <span className={styles.certBadge}>FRONT</span>
          <h3 className={styles.certTitle}>証明書</h3>
          <p className={styles.certSub}>A-0421 / 2026-04-20</p>
          <p className={styles.flipHint}>クリックで裏返す →</p>
        </div>
        <div className={styles.flipBack}>
          <p className={styles.cardLabel}>署名メタデータ</p>
          <p className={styles.flipMeta}>issuer: Ledra Inc.</p>
          <p className={styles.flipMeta}>hash: 0x4a3b…c21f</p>
          <p className={styles.flipMeta}>signed: 2026-04-20T15:04Z</p>
        </div>
      </div>
    </div>
  );
}

function IsoStack() {
  return (
    <div className={styles.isoStage}>
      <div className={`${styles.isoLayer} ${styles.isoL1}`}>1</div>
      <div className={`${styles.isoLayer} ${styles.isoL2}`}>2</div>
      <div className={`${styles.isoLayer} ${styles.isoL3}`}>3</div>
    </div>
  );
}

function ThreeDSection() {
  return (
    <Section
      id="threed"
      tag="11 · 3D"
      title="立体表現"
      description="フリップ・アイソメトリック。平面UIに奥行きを持たせる。"
    >
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>フリップカード</p>
          <div className={styles.centerBox}>
            <FlipCard />
          </div>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>アイソメトリックスタック</p>
          <div className={styles.centerBox}>
            <IsoStack />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 12 · DATA — Bar chart / Gauge / Line graph
// ═══════════════════════════════════════════════════
function useIsVisible<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setOn(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, on };
}

function BarChart() {
  const { ref, on } = useIsVisible<HTMLDivElement>();
  const data = [62, 80, 45, 95, 70, 55, 88];
  const labels = ["月", "火", "水", "木", "金", "土", "日"];
  return (
    <div ref={ref} className={styles.barChart}>
      {data.map((v, i) => (
        <div key={i} className={styles.barCol}>
          <div className={styles.bar} style={{ height: on ? `${v}%` : "0%", transitionDelay: `${i * 80}ms` }} />
          <span className={styles.barLabel}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  const { ref, on } = useIsVisible<HTMLDivElement>();
  const angle = on ? -90 + (value / 100) * 180 : -90;
  return (
    <div ref={ref} className={styles.gauge}>
      <svg viewBox="0 0 120 72" className={styles.gaugeSvg}>
        <path d="M10 60 A 50 50 0 0 1 110 60" fill="none" stroke="var(--border-default)" strokeWidth="8" />
        <path
          d="M10 60 A 50 50 0 0 1 110 60"
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={on ? 1 - value / 100 : 1}
          style={{ transition: "stroke-dashoffset 1400ms var(--ease-out)" }}
        />
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: "60px 60px",
            transition: "transform 1400ms var(--ease-spring)",
          }}
        >
          <line x1="60" y1="60" x2="60" y2="20" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="60" cy="60" r="4" fill="var(--text-primary)" />
        </g>
      </svg>
      <p className={styles.gaugeValue}>{value}%</p>
    </div>
  );
}

function LineGraph() {
  const { ref, on } = useIsVisible<HTMLDivElement>();
  return (
    <div ref={ref} className={styles.lineGraphWrap}>
      <svg viewBox="0 0 240 100" className={styles.lineGraph} preserveAspectRatio="none">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 80 L40 60 L80 68 L120 30 L160 45 L200 20 L240 35 L240 100 L0 100 Z"
          fill="url(#lg)"
          style={{ opacity: on ? 1 : 0, transition: "opacity 800ms 400ms" }}
        />
        <path
          className={styles.linePath}
          d="M0 80 L40 60 L80 68 L120 30 L160 45 L200 20 L240 35"
          fill="none"
          stroke="var(--accent-blue)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={on ? 0 : 1}
          style={{ transition: "stroke-dashoffset 1600ms var(--ease-out)" }}
        />
      </svg>
    </div>
  );
}

function DataSection() {
  return (
    <Section
      id="data"
      tag="12 · Data"
      title="データビジュアライゼーション"
      description="数字を「動きながら読ませる」。棒グラフ、ゲージ、折れ線の段階描画。"
    >
      <div className={styles.grid3}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>棒グラフ</p>
          <BarChart />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>ゲージ</p>
          <Gauge value={72} />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>折れ線グラフ</p>
          <LineGraph />
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 13 · EFFECTS — Particles / Glitch / Shake
// ═══════════════════════════════════════════════════
function Particles() {
  const pieces = Array.from({ length: 40 });
  return (
    <div className={styles.particleBox} aria-hidden>
      {pieces.map((_, i) => {
        const size = 2 + Math.random() * 3;
        return (
          <span
            key={i}
            className={styles.particle}
            style={{
              left: `${Math.random() * 100}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDelay: `${Math.random() * 4}s`,
              animationDuration: `${5 + Math.random() * 5}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function GlitchText({ text }: { text: string }) {
  return (
    <span className={styles.glitch} data-text={text}>
      {text}
    </span>
  );
}

function ShakeButton() {
  const [shake, setShake] = useState(0);
  return (
    <button
      key={shake}
      type="button"
      className={`${styles.shakeBtn} ${shake ? styles.shakeOn : ""}`}
      onClick={() => setShake((n) => n + 1)}
    >
      間違い！
    </button>
  );
}

function EffectsSection() {
  return (
    <Section
      id="effects"
      tag="13 · Effects"
      title="ゲーム的演出"
      description="パーティクル・グリッチ・シェイク。インパクトを求める場面で。"
    >
      <div className={styles.grid3}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>パーティクル</p>
          <Particles />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>グリッチ</p>
          <div className={styles.centerBox} style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            <GlitchText text="LEDRA" />
          </div>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>シェイク（クリック）</p>
          <div className={styles.centerBox}>
            <ShakeButton />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 14 · INTERACTION — Swipe / Command palette
// ═══════════════════════════════════════════════════
function SwipeList() {
  const [items, setItems] = useState([
    { id: 1, label: "証明書 #A-0421" },
    { id: 2, label: "証明書 #A-0422" },
    { id: 3, label: "証明書 #A-0423" },
  ]);
  const [drag, setDrag] = useState<{ id: number; x: number } | null>(null);
  const startRef = useRef(0);

  const onDown = (id: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    startRef.current = e.clientX;
    setDrag({ id, x: 0 });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ ...drag, x: Math.min(0, e.clientX - startRef.current) });
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.x < -100) {
      const id = drag.id;
      setItems((prev) => prev.filter((it) => it.id !== id));
    }
    setDrag(null);
  };
  return (
    <div className={styles.swipeList}>
      {items.map((it) => (
        <div key={it.id} className={styles.swipeItem}>
          <div className={styles.swipeBg}>
            <span>削除</span>
          </div>
          <div
            className={styles.swipeFg}
            style={{
              transform: drag?.id === it.id ? `translateX(${drag.x}px)` : "translateX(0)",
              transition: drag?.id === it.id ? "none" : "transform 320ms var(--ease-spring)",
            }}
            onPointerDown={onDown(it.id)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {it.label}
            <span className={styles.swipeHint}>← swipe</span>
          </div>
        </div>
      ))}
      {items.length === 0 && (
        <button
          type="button"
          className="btn-secondary"
          data-size="sm"
          onClick={() =>
            setItems([
              { id: Date.now() + 1, label: "証明書 #A-0421" },
              { id: Date.now() + 2, label: "証明書 #A-0422" },
              { id: Date.now() + 3, label: "証明書 #A-0423" },
            ])
          }
        >
          リセット
        </button>
      )}
    </div>
  );
}

function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = ["証明書を新規作成", "ダッシュボードへ", "保険会社を検索", "設定を開く", "ログアウト"];
  const filtered = commands.filter((c) => c.includes(query));

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        ⌘K を押す（またはクリック）
      </button>
      <div className={`${styles.paletteOverlay} ${open ? styles.paletteOverlayOn : ""}`} onClick={() => setOpen(false)}>
        <div
          className={`${styles.palette} ${open ? styles.paletteOn : ""}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <input
            ref={inputRef}
            className={styles.paletteInput}
            placeholder="コマンドを検索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className={styles.paletteList}>
            {filtered.map((c, i) => (
              <li
                key={c}
                className={styles.paletteItem}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{c}</span>
                <span className={styles.paletteKbd}>↵</span>
              </li>
            ))}
            {filtered.length === 0 && <li className={styles.paletteEmpty}>該当なし</li>}
          </ul>
        </div>
      </div>
    </>
  );
}

function InteractionSection() {
  return (
    <Section
      id="interaction"
      tag="14 · Interaction"
      title="インタラクション"
      description="スワイプで削除、⌘K でコマンドパレット。モバイル・デスクトップ双方で効く。"
    >
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>スワイプ削除（左へドラッグ）</p>
          <SwipeList />
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>コマンドパレット</p>
          <div className={styles.centerBox}>
            <CommandPalette />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 15 · AMBIENT — Spotlight / Noise / Breathing gradient
// ═══════════════════════════════════════════════════
function SpotlightCard() {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--sx", `${e.clientX - r.left}px`);
    el.style.setProperty("--sy", `${e.clientY - r.top}px`);
  };
  return (
    <div ref={ref} className={styles.spotlight} onMouseMove={onMove}>
      <div className={styles.spotlightInner}>
        <p className={styles.spotlightTitle}>カーソルに光が追従</p>
        <p className={styles.spotlightSub}>radial-gradient + CSS var</p>
      </div>
    </div>
  );
}

function BreathingGradient() {
  return <div className={styles.breath} />;
}

function NoiseOverlay() {
  return (
    <div className={styles.noiseBox}>
      <div className={styles.noise} />
      <p className={styles.noiseLabel}>Film grain</p>
    </div>
  );
}

function AmbientSection() {
  return (
    <Section
      id="ambient"
      tag="15 · Ambient"
      title="環境演出"
      description="スポットライト、呼吸するグラデーション、フィルムノイズ。空気感をつくる。"
    >
      <div className={styles.grid3}>
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <SpotlightCard />
        </div>
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <BreathingGradient />
        </div>
        <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
          <NoiseOverlay />
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 16 · FORM — Floating label input / Validation state
// ═══════════════════════════════════════════════════
type FieldKind = "text" | "email" | "password";
type FieldState = { value: string; touched: boolean };

function FloatingLabelInput({
  label,
  type = "text",
  state,
  onChange,
  error,
}: {
  label: string;
  type?: FieldKind;
  state: FieldState;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  const [focused, setFocused] = useState(false);
  const floating = focused || state.value.length > 0;
  const showError = state.touched && !!error;
  return (
    <label
      className={`${styles.floatField} ${floating ? styles.floatFieldUp : ""} ${
        showError ? styles.floatFieldError : ""
      }`}
    >
      <input
        type={type}
        className={styles.floatInput}
        value={state.value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
      />
      <span className={styles.floatLabel}>{label}</span>
      <span className={styles.floatUnderline} aria-hidden />
      <span className={styles.floatError} aria-live="polite">
        {showError ? error : ""}
      </span>
    </label>
  );
}

function FormSection() {
  const [email, setEmail] = useState<FieldState>({ value: "", touched: false });
  const [password, setPassword] = useState<FieldState>({ value: "", touched: false });
  const [name, setName] = useState<FieldState>({ value: "", touched: false });
  const [submitState, setSubmitState] = useState<"idle" | "shake" | "ok">("idle");

  const emailError = !/^\S+@\S+\.\S+$/.test(email.value) ? "有効なメールを入力してください" : null;
  const passwordError = password.value.length < 6 ? "6文字以上で入力してください" : null;
  const nameError = name.value.trim().length < 1 ? "お名前を入力してください" : null;

  const submit = () => {
    setEmail((s) => ({ ...s, touched: true }));
    setPassword((s) => ({ ...s, touched: true }));
    setName((s) => ({ ...s, touched: true }));
    if (emailError || passwordError || nameError) {
      setSubmitState("shake");
      window.setTimeout(() => setSubmitState("idle"), 500);
      return;
    }
    setSubmitState("ok");
    window.setTimeout(() => setSubmitState("idle"), 1600);
  };

  return (
    <Section
      id="form"
      tag="16 · Form"
      title="フローティングラベル & バリデーション"
      description="ラベルが入力エリア内から上部に浮き上がる。フォーカス中は下線がスライド、エラー時は軽くシェイク。"
    >
      <div className={styles.grid2}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>ログインフォーム</p>
          <div className={`${styles.floatForm} ${submitState === "shake" ? styles.floatFormShake : ""}`}>
            <FloatingLabelInput
              label="メールアドレス"
              type="email"
              state={email}
              onChange={(v) => setEmail({ value: v, touched: email.touched })}
              error={emailError}
            />
            <FloatingLabelInput
              label="パスワード"
              type="password"
              state={password}
              onChange={(v) => setPassword({ value: v, touched: password.touched })}
              error={passwordError}
            />
            <FloatingLabelInput
              label="お名前"
              state={name}
              onChange={(v) => setName({ value: v, touched: name.touched })}
              error={nameError}
            />
            <button type="button" className="btn-primary" onClick={submit}>
              {submitState === "ok" ? "送信しました ✓" : "サインアップ"}
            </button>
          </div>
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>状態プレビュー</p>
          <ul className={styles.floatStates}>
            <li>
              <span className={styles.floatStateDot} data-k="idle" /> 初期: ラベルは入力欄内
            </li>
            <li>
              <span className={styles.floatStateDot} data-k="focus" /> フォーカス: ラベルが上へ / 下線がスライド
            </li>
            <li>
              <span className={styles.floatStateDot} data-k="filled" /> 入力済: ラベル位置を保持
            </li>
            <li>
              <span className={styles.floatStateDot} data-k="error" /> エラー: 色変化 + 軽いシェイク
            </li>
          </ul>
          <p className={styles.cardText}>
            ログイン / サインアップ画面での使用を想定。ラベルとプレースホルダを兼ねることで視線移動を減らし、余白を節約できる。
          </p>
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 17 · FLOW — Stepper with progress fill & check draw
// ═══════════════════════════════════════════════════
const STEPS = ["情報入力", "内容確認", "電子署名", "発行完了"] as const;

function Stepper({ step }: { step: number }) {
  const fillPct = STEPS.length <= 1 ? 0 : (Math.min(step, STEPS.length - 1) / (STEPS.length - 1)) * 100;
  return (
    <div className={styles.stepper}>
      <div className={styles.stepperTrack} aria-hidden>
        <div className={styles.stepperFill} style={{ width: `${fillPct}%` }} />
      </div>
      <ol className={styles.stepperList}>
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={label} className={`${styles.stepItem} ${styles[`step_${state}`]}`}>
              <span className={styles.stepDot}>
                {state === "done" ? (
                  <svg viewBox="0 0 24 24" className={styles.stepCheck} aria-hidden>
                    <path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span className={styles.stepNum}>{i + 1}</span>
                )}
                {state === "current" && <span className={styles.stepPulse} aria-hidden />}
              </span>
              <span className={styles.stepLabel}>{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FlowSection() {
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      setStep((s) => (s >= STEPS.length - 1 ? 0 : s + 1));
    }, 1800);
    return () => window.clearInterval(id);
  }, [auto]);

  return (
    <Section
      id="flow"
      tag="17 · Flow"
      title="ステッパー進捗バー"
      description="証明書の発行フローや申込ウィザードで。完了ステップは描画されたチェック、現在ステップはパルスで示す。"
    >
      <div className={styles.card} style={{ padding: "2.5rem 1.75rem" }}>
        <Stepper step={step} />
        <div className={styles.stepperCtrls}>
          <button
            type="button"
            className="btn-ghost"
            data-size="sm"
            onClick={() => {
              setAuto(false);
              setStep((s) => Math.max(0, s - 1));
            }}
          >
            ← 戻る
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-size="sm"
            onClick={() => {
              setAuto(false);
              setStep((s) => Math.min(STEPS.length - 1, s + 1));
            }}
          >
            次へ →
          </button>
          <button
            type="button"
            className="btn-ghost"
            data-size="sm"
            onClick={() => {
              setStep(0);
              setAuto(true);
            }}
          >
            ⟳ 自動再生
          </button>
        </div>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// 18 · LOADING — Skeleton shimmer for cards / tables / charts
// ═══════════════════════════════════════════════════
function SkeletonCard() {
  return (
    <div className={styles.skelCard}>
      <div className={`${styles.skel} ${styles.skelAvatar}`} />
      <div className={styles.skelLines}>
        <div className={`${styles.skel} ${styles.skelLine}`} style={{ width: "70%" }} />
        <div className={`${styles.skel} ${styles.skelLine}`} style={{ width: "40%" }} />
      </div>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className={styles.skelTable}>
      {[0, 1, 2, 3].map((r) => (
        <div key={r} className={styles.skelRow}>
          <div className={`${styles.skel} ${styles.skelCell}`} style={{ width: "28%" }} />
          <div className={`${styles.skel} ${styles.skelCell}`} style={{ width: "20%" }} />
          <div className={`${styles.skel} ${styles.skelCell}`} style={{ width: "16%" }} />
          <div className={`${styles.skel} ${styles.skelCellBadge}`} />
        </div>
      ))}
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className={styles.skelChart}>
      <div className={`${styles.skel} ${styles.skelChartTitle}`} />
      <div className={styles.skelChartBars}>
        {[52, 78, 34, 88, 64, 72, 46].map((h, i) => (
          <div key={i} className={`${styles.skel} ${styles.skelBar}`} style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function LoadingSection() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(() => setLoading(false), 3200);
    return () => window.clearTimeout(id);
  }, [loading]);

  return (
    <Section
      id="loading"
      tag="18 · Loading"
      title="スケルトンシマー"
      description="ダッシュボードなど読み込み待ちの空白を滑らかに埋める。シマー波がコンテンツの形状を先行表示して体感待ち時間を短くする。"
    >
      <div className={styles.grid3}>
        <div className={styles.card}>
          <p className={styles.cardLabel}>カード</p>
          {loading ? (
            <SkeletonCard />
          ) : (
            <div className={styles.skelCard}>
              <div className={styles.skelAvatarReal}>L</div>
              <div className={styles.skelLines}>
                <p className={styles.skelLineReal}>Ledra Inc.</p>
                <p className={styles.skelLineSub}>info@holy-auto.com</p>
              </div>
            </div>
          )}
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>テーブル</p>
          {loading ? (
            <SkeletonTable />
          ) : (
            <div className={styles.skelTable}>
              {[
                { a: "A-0421", b: "横浜市", c: "2026-04-20", badge: "発行済" },
                { a: "A-0422", b: "川崎市", c: "2026-04-22", badge: "下書き" },
                { a: "A-0423", b: "藤沢市", c: "2026-04-22", badge: "署名中" },
                { a: "A-0424", b: "平塚市", c: "2026-04-23", badge: "発行済" },
              ].map((row) => (
                <div key={row.a} className={styles.skelRow}>
                  <span className={styles.skelCellReal}>{row.a}</span>
                  <span className={styles.skelCellReal}>{row.b}</span>
                  <span className={styles.skelCellReal}>{row.c}</span>
                  <span className={styles.skelBadgeReal}>{row.badge}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.card}>
          <p className={styles.cardLabel}>グラフ</p>
          {loading ? (
            <SkeletonChart />
          ) : (
            <div className={styles.skelChart}>
              <p className={styles.skelChartTitleReal}>今月の発行数</p>
              <div className={styles.skelChartBars}>
                {[52, 78, 34, 88, 64, 72, 46].map((h, i) => (
                  <div key={i} className={styles.skelBarReal} style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={styles.ctaRow} style={{ marginTop: "1.5rem" }}>
        <button type="button" className="btn-secondary" data-size="sm" onClick={() => setLoading((v) => !v)}>
          {loading ? "ロード完了" : "もう一度ロードする"}
        </button>
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════
// Exported: all advanced sections
// ═══════════════════════════════════════════════════
export function AdvancedSections() {
  return (
    <>
      <ScrollProgressBar />
      <TextSection />
      <PhysicsSection />
      <ScrollSection />
      <SvgSection />
      <ThreeDSection />
      <DataSection />
      <EffectsSection />
      <InteractionSection />
      <AmbientSection />
      <FormSection />
      <FlowSection />
      <LoadingSection />
    </>
  );
}
