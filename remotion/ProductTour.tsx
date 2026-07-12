import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { Slideshow, totalFrames, type SlideDef } from "./Slideshow";
import { FONT, BLUE, TEXT, TEXT_MUTED } from "./components/shared";

/**
 * 短尺プロダクトツアー（LP / 商談 / SNS 向け・約28秒）。
 *
 * 既存の説明会・オンボーディング動画はいずれも 4.5〜29 分の長尺で、LP の
 * 直帰対策には長すぎる。本コンポジションは、サイト内のインタラクティブ・
 * ツアー (ProductTourSection) と同じ 4 ステップの筋書き
 * 「車両を選ぶ → 施工メニュー → 内容確認 → 発行完了(URL/QR/BC)」を
 * そのまま短尺の動画に落とす。文言・保証年数・注意書きは実装と一致させ、
 * 誇張のない事実ベースに保つ（要望⑧）。
 *
 * durationInFrames は PRODUCT_TOUR_FRAMES（= 各スライドの合計）から導出する
 * ので、スライドを足し引きしても尺がズレない。index.tsx は同じ定数を使う。
 */

// ── 小物 ────────────────────────────────────────────────────────────────

/** ブラウザ風のウィンドウ枠（サイト内デモと同じ意匠） */
function WindowChrome({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 1160,
        margin: "0 auto",
        borderRadius: 20,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "linear-gradient(135deg,#0a0f1a,#0b111c)",
        boxShadow: "0 40px 100px rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 22px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {["rgba(251,113,133,0.4)", "rgba(251,191,36,0.4)", "rgba(52,211,153,0.4)"].map((c) => (
          <span key={c} style={{ width: 13, height: 13, borderRadius: "50%", background: c }} />
        ))}
        <span style={{ marginLeft: 14, fontFamily: "monospace", fontSize: 20, color: "rgba(255,255,255,0.7)" }}>{url}</span>
      </div>
      <div style={{ padding: 48, minHeight: 520, boxSizing: "border-box" }}>{children}</div>
    </div>
  );
}

/** 進行ドット（サイト内ツアーの StepDots と対応） */
function StepDots({ current }: { current: number }) {
  const labels = ["車両", "メニュー", "確認", "発行"];
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 40 }}>
      {labels.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              background: i <= current ? BLUE : "rgba(255,255,255,0.08)",
              color: i <= current ? "#fff" : "rgba(255,255,255,0.5)",
            }}
          >
            {i + 1}
          </div>
          {i < labels.length - 1 && (
            <div style={{ width: 40, height: 2, background: i < current ? BLUE : "rgba(255,255,255,0.12)" }} />
          )}
        </div>
      ))}
    </div>
  );
}

/** 選択肢カード（順にフェードイン） */
function ChoiceCard({ label, sub, index, selected }: { label: string; sub: string; index: number; selected?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.max(0, frame - index * 10);
  const opacity = spring({ frame: start, fps, config: { damping: 18 }, durationInFrames: 16 });
  const y = interpolate(start, [0, 16], [16, 0], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        borderRadius: 14,
        padding: "22px 26px",
        border: `1px solid ${selected ? BLUE : "rgba(255,255,255,0.1)"}`,
        background: selected ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 700, color: TEXT }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 19, color: TEXT_MUTED }}>{sub}</div>
    </div>
  );
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 30, fontWeight: 700, color: TEXT, marginBottom: 28 }}>{children}</div>;
}

/** 発行完了で使う QR（サイト内ツアーと同じ意匠） */
function QRMark({ size = 96 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={{ color: TEXT }} aria-hidden>
      <rect x="2" y="2" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="44" y="2" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="2" y="44" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="8" y="8" width="6" height="6" fill="currentColor" />
      <rect x="50" y="8" width="6" height="6" fill="currentColor" />
      <rect x="8" y="50" width="6" height="6" fill="currentColor" />
      <rect x="28" y="2" width="4" height="4" fill="currentColor" />
      <rect x="28" y="28" width="8" height="8" fill="currentColor" />
      <rect x="44" y="28" width="4" height="4" fill="currentColor" />
      <rect x="28" y="44" width="4" height="4" fill="currentColor" />
      <rect x="52" y="52" width="4" height="4" fill="currentColor" />
      <rect x="44" y="44" width="4" height="4" fill="currentColor" />
    </svg>
  );
}

/** 中央寄せのスライド土台 */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <AbsoluteFill style={{ background: "#060a12", fontFamily: FONT }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.022) 1px,transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 120px", boxSizing: "border-box" }}>
        {children}
      </div>
    </AbsoluteFill>
  );
}

// ── スライド ────────────────────────────────────────────────────────────

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 20 }, durationInFrames: 24 });
  const y = interpolate(frame, [0, 24], [24, 0], { extrapolateRight: "clamp" });
  return (
    <Stage>
      <div style={{ opacity: op, transform: `translateY(${y}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 22, letterSpacing: "0.3em", color: BLUE, marginBottom: 28 }}>
          PRODUCT TOUR
        </div>
        <div style={{ fontSize: 96, fontWeight: 800, color: TEXT, letterSpacing: "-0.02em" }}>Ledra</div>
        <div style={{ marginTop: 24, fontSize: 34, color: TEXT_MUTED, lineHeight: 1.5 }}>
          施工の事実を、改ざんできない証明に。
          <br />
          発行はたった4ステップ。
        </div>
      </div>
    </Stage>
  );
};

const Step1: React.FC = () => (
  <Stage>
    <StepDots current={0} />
    <WindowChrome url="admin.ledra.app / certificates / new">
      <StepTitle>Step 1 — どの車両ですか？</StepTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        <ChoiceCard label="ALPHARD" sub="2023年式・黒" index={0} selected />
        <ChoiceCard label="PRIUS" sub="2022年式・白" index={1} />
        <ChoiceCard label="N-BOX" sub="2024年式・銀" index={2} />
      </div>
    </WindowChrome>
  </Stage>
);

const Step2: React.FC = () => (
  <Stage>
    <StepDots current={1} />
    <WindowChrome url="admin.ledra.app / certificates / new">
      <StepTitle>Step 2 — どの施工メニューですか？</StepTitle>
      <div style={{ display: "grid", gap: 16 }}>
        <ChoiceCard label="ボディコーティング" sub="ガラス系・5年保証" index={0} selected />
        <ChoiceCard label="PPF（フィルム施工）" sub="全面・7年保証" index={1} />
        <ChoiceCard label="ガラスコーティング" sub="撥水仕様・3年保証" index={2} />
      </div>
    </WindowChrome>
  </Stage>
);

const Step3: React.FC = () => (
  <Stage>
    <StepDots current={2} />
    <WindowChrome url="admin.ledra.app / certificates / new">
      <StepTitle>Step 3 — 内容を確認して発行</StepTitle>
      <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", padding: 34 }}>
        {[
          ["車両", "ALPHARD"],
          ["施工メニュー", "ボディコーティング"],
          ["保証", "5年保証"],
        ].map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 26, padding: "14px 0", borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ color: TEXT_MUTED }}>{k}</span>
            <span style={{ color: TEXT, fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 26, borderRadius: 12, textAlign: "center", padding: "20px 0", fontSize: 26, fontWeight: 600, color: "#fff", background: "linear-gradient(90deg,#2563eb,#3b82f6)" }}>
        証明書を発行する
      </div>
    </WindowChrome>
  </Stage>
);

const Step4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 120 }, durationInFrames: 26 });
  return (
    <Stage>
      <StepDots current={3} />
      <WindowChrome url="admin.ledra.app / certificates / 8a4f...c2e1">
        <div style={{ textAlign: "center" }}>
          <div style={{ transform: `scale(${pop})`, width: 84, height: 84, margin: "0 auto", borderRadius: "50%", background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div style={{ marginTop: 22, fontSize: 34, fontWeight: 700, color: TEXT }}>証明書を発行しました</div>
          <div style={{ marginTop: 10, fontSize: 22, color: TEXT_MUTED }}>ALPHARD の施工証明書 — ブロックチェーン記録済み</div>
          <div style={{ margin: "34px auto 0", display: "flex", alignItems: "center", gap: 22, maxWidth: 560, borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", padding: "24px 30px", textAlign: "left" }}>
            <QRMark />
            <div>
              <div style={{ fontFamily: "monospace", fontSize: 24, color: TEXT }}>ledra.app/v/8a4f...c2e1</div>
              <div style={{ marginTop: 8, fontSize: 19, color: TEXT_MUTED }}>URLとQRで、そのまま共有できます</div>
            </div>
          </div>
        </div>
      </WindowChrome>
    </Stage>
  );
};

const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = spring({ frame, fps, config: { damping: 20 }, durationInFrames: 24 });
  return (
    <Stage>
      <div style={{ opacity: op, textAlign: "center" }}>
        <div style={{ fontSize: 60, fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>
          履歴に、嘘をつかせない。
        </div>
        <div style={{ marginTop: 26, fontSize: 30, color: TEXT_MUTED }}>登録もログインも不要。まずは無料で1枚。</div>
        <div style={{ marginTop: 44, display: "inline-block", borderRadius: 14, padding: "22px 56px", fontSize: 30, fontWeight: 700, color: "#060a12", background: "#fff" }}>
          無料で試す
        </div>
        <div style={{ marginTop: 30, fontFamily: "monospace", fontSize: 24, letterSpacing: "0.1em", color: BLUE }}>ledra.app</div>
      </div>
    </Stage>
  );
};

// ── コンポジション ──────────────────────────────────────────────────────

export const PRODUCT_TOUR_SLIDES: SlideDef[] = [
  { component: Intro, frames: 120 },
  { component: Step1, frames: 130 },
  { component: Step2, frames: 130 },
  { component: Step3, frames: 140 },
  { component: Step4, frames: 180 },
  { component: Outro, frames: 130 },
];

/** 合計フレーム数（index.tsx の durationInFrames はこれを使う → 尺ズレ不能）。 */
export const PRODUCT_TOUR_FRAMES = totalFrames(PRODUCT_TOUR_SLIDES);

export const ProductTourVideo: React.FC = () => <Slideshow slides={PRODUCT_TOUR_SLIDES} />;
