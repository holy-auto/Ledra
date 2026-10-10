import { PitchDeck, type Slide } from "../PitchDeck";

// ─── Slide chrome ───────────────────────────────────────────────
function S({ children, n, total = 6 }: { children: React.ReactNode; n: number; total?: number }) {
  return (
    <div
      className="w-full h-full flex flex-col bg-[#060a12] overflow-hidden"
      style={{ fontFamily: "var(--font-noto), var(--font-noto-sans), sans-serif" }}
    >
      <div className="h-[3px] w-full bg-gradient-to-r from-purple-500 to-violet-400 shrink-0" />
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      <div className="px-10 py-2.5 flex items-center justify-between border-t border-white/[0.06] shrink-0">
        <span className="text-white text-[11px] tracking-wide">Ledra — Confidential · 2026年4月</span>
        <span className="text-white text-[11px] font-mono">
          {n}/{total}
        </span>
      </div>
    </div>
  );
}

function Chip({
  children,
  color = "purple",
}: {
  children: React.ReactNode;
  color?: "purple" | "violet" | "green" | "none";
}) {
  const cls =
    color === "purple"
      ? "border-purple-500/30 bg-purple-500/10 text-purple-300"
      : color === "violet"
        ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
        : color === "green"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-white/15 bg-white/5 text-white";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

// ─── スライド定義 ───────────────────────────────────────────────

const S1 = (
  <S n={1}>
    {/* Cover */}
    <div className="flex flex-col items-center justify-center flex-1 text-center px-10 gap-5">
      <div className="flex gap-2 flex-wrap justify-center">
        <Chip>KINTO</Chip>
        <Chip color="violet">プロダクト / 事業開発</Chip>
        <Chip color="none">PoC 2026</Chip>
      </div>
      <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-white">
        KINTO ×{" "}
        <span className="bg-gradient-to-r from-purple-400 to-violet-300 bg-clip-text text-transparent">Ledra</span>
      </h1>
      <p className="text-base text-white max-w-xl leading-relaxed">
        安全運転証明の次は、整備・施工証明。
        <br />
        加入者のクルマへのケアを、スコアに変える。
      </p>
      <div className="mt-2 flex gap-6 text-xs text-white">
        <span>SBT設計思想との共鳴</span>
        <span>·</span>
        <span>施工証明 × KINTOスコア</span>
        <span>·</span>
        <span>保険料割引への直結</span>
      </div>
    </div>
  </S>
);

const S2 = (
  <S n={2}>
    {/* Resonance with KINTO SBT */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-2">共鳴ポイント</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">
          KINTOのSBT安全運転証明と
          <br />
          同じ設計思想
        </h2>
        <p className="text-sm text-white mt-1">
          2024年のSBT実証実験が証明した「行動の証明をブロックチェーンで発行する」モデルを、施工領域に拡張します。
        </p>
      </div>
      <div className="flex-1 flex items-center">
        <div className="w-full overflow-hidden rounded-xl border border-white/[0.08]">
          <div className="grid grid-cols-3 text-xs font-semibold text-white bg-white/[0.04] px-4 py-2.5 border-b border-white/[0.06] uppercase tracking-wide">
            <span></span>
            <span className="text-center">
              KINTO SBT
              <br />
              安全運転証明
            </span>
            <span className="text-center text-purple-400">
              Ledra
              <br />
              施工証明
            </span>
          </div>
          {[
            { label: "証明の対象", kinto: "ドライバーの安全運転行動", ledra: "車両へのアフター施工" },
            { label: "証明の主体", kinto: "KINTO", ledra: "認定施工店" },
            { label: "改ざん耐性", kinto: "ブロックチェーン", ledra: "C2PA + Polygon" },
            { label: "受益者", kinto: "ドライバー（加入者）", ledra: "車両オーナー（加入者）" },
            { label: "経済効果", kinto: "保険料割引（想定）", ledra: "中古車査定価値向上" },
          ].map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 px-4 py-2.5 text-xs border-b border-white/[0.05] last:border-0 ${i % 2 === 0 ? "bg-white/[0.01]" : ""}`}
            >
              <span className="text-white">{row.label}</span>
              <span className="text-center text-white">{row.kinto}</span>
              <span className="text-center text-purple-300 font-semibold">{row.ledra}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </S>
);

const S3 = (
  <S n={3}>
    {/* Integration Flow */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-2">連携フロー</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">施工証明 → KINTOスコア反映まで</h2>
      </div>
      <div className="flex-1 flex flex-col justify-center gap-3">
        {[
          {
            n: 1,
            actor: "KINTO加入者",
            label: "認定施工店でコーティング・PPF施工",
            detail: "「KINTO提携施工店」でLedraを使う施工店なら、証明書が自動的にKINTO加入者のVINと紐づく。",
            color: "bg-purple-600",
            shadow: "shadow-[0_0_12px_rgba(168,85,247,0.4)]",
          },
          {
            n: 2,
            actor: "Ledra",
            label: "C2PA署名 + Polygonアンカー（自動）",
            detail: "施工写真のハッシュがブロックチェーンに記録される。改ざん不可能な施工の証拠が完成。",
            color: "bg-violet-600",
            shadow: "shadow-[0_0_12px_rgba(139,92,246,0.4)]",
          },
          {
            n: 3,
            actor: "KINTO API",
            label: "証明書Txハッシュ → KINTOスコアへ反映",
            detail: "LedraがKINTO APIに施工証明データを送信。「車両ケアスコア」として加入者プロフィールに追加される。",
            color: "bg-purple-700",
            shadow: "shadow-[0_0_12px_rgba(126,34,206,0.4)]",
          },
          {
            n: 4,
            actor: "保険会社",
            label: "スコアに基づく保険料割引・特典付与",
            detail: "高品質な施工実績が定量的に証明されることで、保険料算定の客観的根拠になる。",
            color: "bg-violet-700",
            shadow: "shadow-[0_0_12px_rgba(109,40,217,0.4)]",
          },
        ].map((step) => (
          <div key={step.n} className="flex items-start gap-4">
            <div
              className={`h-8 w-8 shrink-0 rounded-full ${step.color} flex items-center justify-center text-xs font-bold text-white ${step.shadow}`}
            >
              {step.n}
            </div>
            <div className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-2.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-white">{step.label}</span>
                <p className="text-xs text-white mt-0.5 leading-relaxed">{step.detail}</p>
              </div>
              <span className="text-[10px] border border-white/10 rounded-full px-2 py-0.5 text-white shrink-0">
                {step.actor}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </S>
);

const S4 = (
  <S n={4}>
    {/* Business Value */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-2">ビジネス価値</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">加入者リテンションと差別化</h2>
        <p className="text-sm text-white mt-1">施工証明の蓄積は「KINTOを使い続ける理由」になります。</p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            tag: "加入者スイッチングコスト",
            title: "施工履歴がKINTOに蓄積",
            body: "Ledra × KINTOで蓄積した施工証明は他社では再現できない資産になる。スイッチングコストが有機的に形成される。",
          },
          {
            tag: "保険収益性の改善",
            title: "施工実績 = 車両状態の客観指標",
            body: "PPF・コーティング施工済み車両は傷・劣化リスクが低い。証明可能なケア実績は保険査定の客観的根拠になり、合理的な料率設計が可能になる。",
          },
          {
            tag: "市場差別化",
            title: "「施工証明付き」KINTOブランド",
            body: "「KINTOを使えば施工実績がブロックチェーンで証明される」という付加価値は他のモビリティサービスにはない独自ポジション。",
          },
        ].map((item) => (
          <div key={item.tag} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Chip color="violet">{item.tag}</Chip>
            </div>
            <h3 className="text-sm font-bold text-white leading-snug">{item.title}</h3>
            <p className="text-xs text-white leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  </S>
);

const S5 = (
  <S n={5}>
    {/* PoC Proposal */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-2">PoC提案</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">KINTO加入者への施工証明特典</h2>
        <p className="text-sm text-white mt-1">SBT安全運転証明と同じアプローチで、施工領域のPoC。</p>
      </div>
      <div className="flex gap-5 flex-1">
        <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-white mb-4">PoCスコープ</div>
          <div className="space-y-3">
            {[
              { label: "期間", value: "3ヶ月" },
              { label: "対象", value: "KINTO加入者が利用する施工店（1〜3店舗）" },
              { label: "費用", value: "Ledraシステム費用：Ledra全額負担" },
              { label: "必要書類", value: "NDA + PoC合意書（本番採用の義務なし）" },
              { label: "API連携", value: "KINTOスコアへの反映はPoC期間中に設計" },
            ].map((row) => (
              <div key={row.label} className="flex gap-3 border-b border-white/[0.05] pb-3 last:border-0 last:pb-0">
                <span className="text-xs text-white w-24 shrink-0">{row.label}</span>
                <span className="text-xs font-semibold text-white">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-white mb-4">期待される成果</div>
          <div className="space-y-3">
            {[
              { metric: "KINTO加入者の施工証明発行数", target: "50件以上" },
              { metric: "スコア反映テスト件数", target: "API連携で20件" },
              { metric: "車両パスポート発行台数", target: "30台以上" },
              { metric: "加入者のパスポート閲覧数", target: "延べ100回以上" },
              { metric: "施工店スタッフ継続率", target: "3ヶ月間継続" },
            ].map((row) => (
              <div key={row.metric} className="flex items-center justify-between gap-3">
                <span className="text-xs text-white">{row.metric}</span>
                <Chip>{row.target}</Chip>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </S>
);

const S6 = (
  <S n={6}>
    {/* Next Step */}
    <div className="flex flex-col items-center justify-center flex-1 text-center px-10 gap-6">
      <Chip>Next Step</Chip>
      <h2 className="text-3xl font-extrabold text-white leading-snug">まず 15分、話しませんか</h2>
      <p className="text-sm text-white max-w-lg leading-relaxed">
        SBT安全運転証明を立ち上げた事業開発の経験がある方と話したいと思っています。
        <br />
        施工証明は「その次」を作れる領域です。
      </p>
      <div className="flex gap-8 mt-2">
        {[
          { n: "1", label: "15分オンラインMTG", sub: "デモ + コンセプト確認" },
          { n: "2", label: "API連携の設計", sub: "技術者同士で30分" },
          { n: "3", label: "3ヶ月PoC", sub: "実加入者でデータ取得" },
        ].map((step) => (
          <div key={step.n} className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.4)]">
              {step.n}
            </div>
            <div className="text-sm font-bold text-white">{step.label}</div>
            <div className="text-xs text-white">{step.sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-1 text-xs text-white">
        <span>ledra.co.jp/contact</span>
        <span>Polygon PoS · C2PA · KINTO SBT設計思想との互換 · 第三者セキュリティ監査済み</span>
      </div>
    </div>
  </S>
);

// ─── Page ───────────────────────────────────────────────────────

export const metadata = {
  title: "Ledra × KINTO | Pitch Deck",
  robots: { index: false, follow: false },
};

const slides: Slide[] = [
  { id: "cover", node: S1 },
  { id: "resonance", node: S2 },
  { id: "flow", node: S3 },
  { id: "value", node: S4 },
  { id: "poc", node: S5 },
  { id: "next", node: S6 },
];

export default function KintoPitchPage() {
  return <PitchDeck slides={slides} label="KINTO 向け" />;
}
