import { useEffect, useState } from "react";
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from "remotion";

/**
 * モバイルアプリの起動オープニング（apps/mobile/assets/ledra-intro.mp4 の生成元）。
 *
 * 旧素材は外部ツールで作った横長動画の一部を約1.8倍に引き伸ばしていて荒かった
 * （DECISION_LOG 2026-10-12）。ここではロゴを SVG で描き直し、端末の解像度で直接
 * 書き出すので、どこまで拡大しても輪郭がぼけない。
 *
 * **タイミングは apps/mobile/src/lib/introTiming.ts の前提と一致させること。**
 *   - 1.2 秒（72フレーム）でロックアップ（Lマーク + LEDRA）が完成する
 *   - 1.2〜2.0 秒は完全に静止（退場フェードがどこで入っても動きを断ち切らない）
 *   - 2.0 秒（120フレーム）で終わる
 * 背景は app.json の splash.backgroundColor と同じ #d6d0cb。0フレーム目は単色にして、
 * ネイティブスプラッシュからの切り替えに継ぎ目を出さない。
 */
export const MOBILE_INTRO_FPS = 60;
export const MOBILE_INTRO_FRAMES = 120;
/** ここまでに全ての動きを終える（introTiming の「ロックアップ完成 1.2 秒」） */
export const MOBILE_INTRO_SETTLED_FRAME = 72;

const BG = "#d6d0cb";
const NAVY_TEXT = "#11213a";

const ease = Easing.bezier(0.22, 1, 0.36, 1);
const t = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

/** Lマークの外形（login-badge-source.png の座標系で実測してトレース） */
const SILHOUETTE = "M272,152 L357,208 L357,412 L497,412 L497,490 L456,542 L400,544 L350,586 L300,544 L254,543 L198,494 L198,210 Z";
const GOLD_L = "279,174 330,206 330,447 468,447 468,507 279,507";

function useCinzel() {
  const [handle] = useState(() => delayRender("Loading Cinzel"));
  useEffect(() => {
    const face = new FontFace("Cinzel", `url(${staticFile("fonts/Cinzel-800.woff2")})`, { weight: "800" });
    face
      .load()
      .then((f) => document.fonts.add(f))
      .catch((e) => console.warn("[MobileIntro] Cinzel load failed:", e))
      .finally(() => continueRender(handle));
  }, [handle]);
}

function Mark({ frame }: { frame: number }) {
  const base = t(frame, 6, 36);
  const gold = t(frame, 22, 48);
  const stitch = t(frame, 30, 56);
  const pop = (i: number) => t(frame, 40 + i * 4, 52 + i * 4);
  // 金属面を横切るハイライト。72フレームより前に画角の外へ抜ける
  const sweepX = interpolate(frame, [44, 70], [180, 560], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const rivet = (cx: number, cy: number, r: number, i: number) => (
    <circle cx={cx} cy={cy} r={r} fill="url(#mi-rivet)" style={{ transformOrigin: `${cx}px ${cy}px`, transform: `scale(${pop(i)})` }} />
  );

  return (
    <svg viewBox="185 140 330 460" width={330 * 1.5} height={460 * 1.5} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="mi-navy" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22325a" />
          <stop offset=".55" stopColor="#132140" />
          <stop offset="1" stopColor="#0b1630" />
        </linearGradient>
        <linearGradient id="mi-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b6246" stopOpacity=".75" />
          <stop offset=".35" stopColor="#2a3350" stopOpacity=".25" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mi-strap" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0e1a33" />
          <stop offset=".25" stopColor="#1c2a4c" />
          <stop offset=".8" stopColor="#1a2848" />
          <stop offset="1" stopColor="#0c1730" />
        </linearGradient>
        <linearGradient id="mi-lit" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b8995a" />
          <stop offset=".45" stopColor="#e2cb93" />
          <stop offset="1" stopColor="#c2a467" />
        </linearGradient>
        <linearGradient id="mi-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7d6234" />
          <stop offset="1" stopColor="#a5884f" />
        </linearGradient>
        <linearGradient id="mi-top" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#cfb57c" />
          <stop offset=".6" stopColor="#ead6a2" />
          <stop offset="1" stopColor="#c8ab6c" />
        </linearGradient>
        <linearGradient id="mi-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a7d45" />
          <stop offset="1" stopColor="#6a5129" />
        </linearGradient>
        <linearGradient id="mi-cap" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3e3b8" />
          <stop offset="1" stopColor="#c9ad70" />
        </linearGradient>
        <linearGradient id="mi-chev" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b59a63" />
          <stop offset=".5" stopColor="#8c7344" />
          <stop offset=".5" stopColor="#5f4b2a" />
          <stop offset="1" stopColor="#4c3c22" />
        </linearGradient>
        <radialGradient id="mi-rivet" cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#f6e7bd" />
          <stop offset=".5" stopColor="#c3a364" />
          <stop offset="1" stopColor="#6e5428" />
        </radialGradient>
        <linearGradient id="mi-clasp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9d6a3" />
          <stop offset="1" stopColor="#8d7140" />
        </linearGradient>
        <linearGradient id="mi-sweep" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff8e6" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* 金属のヘアライン（横方向に伸びたノイズ）と、革の細かいシボ */}
        <filter id="mi-brush" x="0" y="0" width="1" height="1">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.9" numOctaves={2} seed={3} />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .11 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="mi-leather" x="0" y="0" width="1" height="1">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={7} />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .05 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id="mi-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="-5" dy="9" stdDeviation="9" floodColor="#1a1408" floodOpacity=".28" />
        </filter>
        <clipPath id="mi-sil"><path d={SILHOUETTE} /></clipPath>
        <clipPath id="mi-gold"><polygon points={GOLD_L} /></clipPath>
      </defs>

      <g filter="url(#mi-shadow)">
        {/* 土台（紺の革） */}
        <g style={{ opacity: base, transformOrigin: "350px 370px", transform: `translateY(${(1 - base) * 18}px) scale(${0.94 + base * 0.06})` }}>
          <path d={SILHOUETTE} fill="url(#mi-navy)" />
          <path d={SILHOUETTE} fill="#fff" filter="url(#mi-leather)" />
          <path d={SILHOUETTE} fill="none" stroke="#3b4c72" strokeWidth={2.5} clipPath="url(#mi-sil)" />
          <g clipPath="url(#mi-sil)">
          <polygon points="272,152 357,208 357,412 330,412 330,206 279,174" fill="url(#mi-panel)" />
          <path d="M232,166 L272,152 L277,155 L277,540 L232,540 Z" fill="url(#mi-strap)" />
          <line x1={232.5} y1={166} x2={232.5} y2={540} stroke="#3b4c72" strokeWidth={1.2} opacity={0.9} />
          <path
            d="M272,170 L341,216 L341,428 L481,428 L481,484 L448,526 L395,528 L350,565 L305,528 L260,527 L214,487 L214,219 Z"
            fill="none" stroke="#a88a52" strokeWidth={2} opacity={0.85}
          />
          <rect x={279} y={512} width={186} height={7} fill="#7d663d" />
          <rect x={279} y={512} width={186} height={2} fill="#c7ad74" />
          <path d="M322,527 L378,527 L350,550 Z" fill="url(#mi-chev)" />
          {/* ステッチは上から縫い進める */}
          <line x1={262} y1={166} x2={262} y2={166 + 372 * stitch} stroke="#d8c9a2" strokeWidth={1.6} strokeDasharray="6 4" opacity={0.75} />
          <line x1={270} y1={160} x2={270} y2={540} stroke="#08122a" strokeWidth={2.2} opacity={0.8} />
          <line x1={273} y1={160} x2={273} y2={540} stroke="#3a4a70" strokeWidth={1} opacity={0.8} />
          </g>
        </g>

        {/* 真鍮の L。上から降りて据わる */}
        <g style={{ opacity: gold, transform: `translateY(${(1 - gold) * -22}px)` }}>
          <polygon points="279,174 300,200 300,475 279,507" fill="url(#mi-side)" />
          <polygon points="300,200 330,206 330,447 300,475" fill="url(#mi-lit)" />
          <polygon points="279,174 330,206 300,200" fill="url(#mi-cap)" />
          <polygon points="330,447 468,447 452,475 300,475" fill="url(#mi-top)" />
          <polygon points="279,507 300,475 452,475 468,507" fill="url(#mi-front)" />
          <polygon points="468,447 468,507 452,475" fill="#5e4824" />
          <polygon points={GOLD_L} fill="#fff" filter="url(#mi-brush)" />
          <g clipPath="url(#mi-gold)">
            <rect x={sweepX - 60} y={140} width={120} height={460} fill="url(#mi-sweep)" transform={`skewX(-20) translate(${140} 0)`} />
          </g>
        </g>

        {/* 留め具とリベット */}
        <g style={{ opacity: pop(0) }}>
          {[241, 249, 257].map((y) => (
            <rect key={y} x={224} y={y} width={64 * pop(0)} height={6} rx={1.5} fill="url(#mi-clasp)" />
          ))}
          <circle cx={292} cy={252} r={11} fill="#14213f" stroke="url(#mi-clasp)" strokeWidth={3.5}
            style={{ transformOrigin: "292px 252px", transform: `scale(${pop(1)})` }} />
        </g>
        {rivet(292, 252, 5, 1)}
        {rivet(245, 217, 6, 0)}
        {rivet(245, 355, 6, 2)}
        {rivet(245, 467, 6, 3)}
      </g>
    </svg>
  );
}

function Wordmark({ frame }: { frame: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", fontFamily: "Cinzel, serif", fontWeight: 800, fontSize: 160, letterSpacing: "0.08em", color: NAVY_TEXT, lineHeight: 1, textShadow: "-2px 4px 8px rgba(26,20,8,0.18)" }}>
      {"LEDRA".split("").map((ch, i) => {
        const p = t(frame, 40 + i * 3, 58 + i * 3);
        return (
          <span key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, display: "inline-block" }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
}

export const MobileIntro: React.FC = () => {
  useCinzel();
  const frame = useCurrentFrame();
  const glow = t(frame, 0, 18);
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {/* 中央をわずかに明るくする。0フレーム目は単色（スプラッシュと同じ） */}
      <AbsoluteFill style={{ opacity: glow, background: "radial-gradient(ellipse 70% 45% at 50% 46%, rgba(240,236,231,0.9), rgba(214,208,203,0) 70%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 64, paddingBottom: 40 }}>
        <Mark frame={frame} />
        <Wordmark frame={frame} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
