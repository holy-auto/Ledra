import { PitchDeck, type Slide } from "../PitchDeck";

// ─── Slide chrome ───────────────────────────────────────────────
function S({ children, n, total = 6 }: { children: React.ReactNode; n: number; total?: number }) {
  return (
    <div
      className="w-full h-full flex flex-col bg-[#060a12] overflow-hidden"
      style={{ fontFamily: "var(--font-noto), var(--font-noto-sans), sans-serif" }}
    >
      <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 to-indigo-400 shrink-0" />
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
  color = "blue",
}: {
  children: React.ReactNode;
  color?: "blue" | "indigo" | "green" | "amber" | "none";
}) {
  const cls =
    color === "blue"
      ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
      : color === "indigo"
        ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
        : color === "green"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : color === "amber"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
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
        <Chip>Toyota Blockchain Lab</Chip>
        <Chip color="indigo">エコシステム統合</Chip>
        <Chip color="none">技術提案 2026</Chip>
      </div>
      <h1 className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-white">
        Toyota Blockchain Lab ×{" "}
        <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">Ledra</span>
      </h1>
      <p className="text-base text-white max-w-xl leading-relaxed">
        アフターマーケット施工記録 —
        <br />
        車両ライフサイクルデータの最後の空白を埋める。
      </p>
      <div className="mt-2 flex gap-6 text-xs text-white">
        <span>本番稼働中</span>
        <span>·</span>
        <span>Polygon PoS Anchoring</span>
        <span>·</span>
        <span>第三者セキュリティ監査済み</span>
      </div>
    </div>
  </S>
);

const S2 = (
  <S n={2}>
    {/* The gap in vehicle lifecycle */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">課題：空白地帯</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">
          車両ライフサイクルのブロックチェーン記録
          <br />— アフター施工だけが未カバー
        </h2>
      </div>

      {/* Lifecycle diagram */}
      <div className="flex-1 flex flex-col justify-center gap-4">
        <div className="flex items-stretch gap-2">
          {[
            { label: "製造・出荷", who: "TBL", covered: true },
            { label: "ディーラー整備", who: "TBL / TBLOCK SIGN", covered: true },
            { label: "アフターマーケット施工", who: "Ledra", covered: false },
            { label: "中古車売買", who: "MON / Avalanche", covered: true },
            { label: "廃車", who: "TBL", covered: true },
          ].map((item, i, arr) => (
            <div key={item.label} className="flex items-center gap-2 flex-1">
              <div
                className={`flex-1 rounded-xl border p-3 text-center ${
                  item.covered
                    ? "border-white/[0.08] bg-white/[0.03]"
                    : "border-blue-500/50 bg-blue-500/10 shadow-[0_0_24px_rgba(59,130,246,0.2)]"
                }`}
              >
                <div className={`text-xs font-bold ${item.covered ? "text-white" : "text-blue-300"}`}>{item.label}</div>
                <div
                  className={`text-[10px] font-mono mt-0.5 ${item.covered ? "text-white" : "text-blue-400 font-semibold"}`}
                >
                  {item.who}
                </div>
                {!item.covered && (
                  <div className="text-[9px] mt-1 text-blue-400 font-bold uppercase tracking-wide">← 空白地帯</div>
                )}
              </div>
              {i < arr.length - 1 && <span className="text-white text-lg shrink-0">→</span>}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-sm text-white leading-relaxed">
            <span className="font-bold text-blue-300">TBLが描く「車両の製造〜廃棄の全履歴記録」</span>
            において、コーティング・PPF・鈑金塗装などのアフターマーケット施工は
            <span className="font-bold text-white">現在も空白のまま</span>
            です。Ledra はこの領域で
            <span className="font-bold text-blue-300">既に稼働中</span>
            のインフラを持っています。
          </p>
        </div>
      </div>
    </div>
  </S>
);

const S3 = (
  <S n={3}>
    {/* Tech Stack */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">技術スタック</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">
          C2PA + Polygon PoS
          <br />
          改ざん検知の多層構造
        </h2>
      </div>

      <div className="flex gap-5 flex-1">
        {/* Stack diagram */}
        <div className="flex-1 flex flex-col justify-center gap-2">
          {[
            {
              layer: "Layer 3",
              label: "車両デジタルパスポート",
              detail: "/v/[VIN] — VIN横断で施工店を超えて集約",
              color: "border-blue-500/40 bg-blue-500/10",
              text: "text-blue-300",
            },
            {
              layer: "Layer 2",
              label: "Polygonブロックチェーンアンカー",
              detail: "SHA-256ハッシュをPolygon PoSスマートコントラクトに記録",
              color: "border-indigo-500/40 bg-indigo-500/10",
              text: "text-indigo-300",
            },
            {
              layer: "Layer 1",
              label: "C2PA コンテンツ真正性署名",
              detail: "施工写真に、紐づく証明書・車両・登録日時と加工履歴を記したマニフェストを埋め込み",
              color: "border-violet-500/40 bg-violet-500/10",
              text: "text-violet-300",
            },
            {
              layer: "Layer 0",
              label: "施工証明書 + QR / NFC",
              detail: "証明書PDF発行・QRコード生成・NFC書き込みまで一貫",
              color: "border-white/[0.1] bg-white/[0.03]",
              text: "text-white",
            },
          ].map((layer) => (
            <div key={layer.layer} className={`rounded-xl border ${layer.color} px-4 py-3 flex items-center gap-4`}>
              <span className={`text-[10px] font-mono font-bold ${layer.text} w-14 shrink-0`}>{layer.layer}</span>
              <div className="min-w-0">
                <div className={`text-sm font-bold ${layer.text}`}>{layer.label}</div>
                <div className="text-xs text-white mt-0.5">{layer.detail}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Key numbers */}
        <div className="w-[200px] shrink-0 flex flex-col gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white">実装ハイライト</div>
          {[
            { label: "ガス代", value: "約$0.001/Tx", note: "Polygon PoS" },
            { label: "PII保護", value: "ハッシュのみ", note: "PIIはオフチェーン" },
            { label: "Txスループット", value: "7,000+ TPS", note: "Polygon PoS上限" },
            { label: "互換性", value: "EVM互換", note: "Avalanche対応可能" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] text-white">{item.label}</div>
              <div className="text-sm font-bold text-white mt-0.5">{item.value}</div>
              <div className="text-[10px] text-white">{item.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </S>
);

const S4 = (
  <S n={4}>
    {/* Integration Scenarios */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">統合シナリオ</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">
          TBLエコシステムへの接続
          <br />
          3つのアプローチ
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            phase: "Option A",
            color: "blue" as const,
            title: "API連携による\nTx ハッシュ共有",
            body: "Ledraの施工証明PolygonトランザクションハッシュをTBL車両履歴DBに登録するAPIを開発。最短実装。",
            effort: "低",
            impact: "中",
          },
          {
            phase: "Option B",
            color: "indigo" as const,
            title: "MOBI DID との\n互換性確保",
            body: "MOBI車両DID（分散型識別子）ドキュメントの一部としてLedra証明書を参照可能にする。業界標準準拠。",
            effort: "中",
            impact: "高",
          },
          {
            phase: "Option C",
            color: "none" as const,
            title: "ERC-4337 MOA\nとの接続",
            body: "将来的にTBLのMobility Oriented Account（MOA）とLedra車両パスポートを接続。フルスタック連携。",
            effort: "高",
            impact: "最大",
          },
        ].map((item) => (
          <div
            key={item.phase}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Chip color={item.color}>{item.phase}</Chip>
            </div>
            <h3 className="text-sm font-bold text-white leading-snug whitespace-pre-line">{item.title}</h3>
            <p className="text-xs text-white leading-relaxed flex-1">{item.body}</p>
            <div className="flex gap-2">
              <span className="text-[10px] border border-white/10 rounded-full px-2 py-0.5 text-white">
                実装コスト: {item.effort}
              </span>
              <span className="text-[10px] border border-blue-500/20 rounded-full px-2 py-0.5 text-blue-400">
                インパクト: {item.impact}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </S>
);

const S5 = (
  <S n={5}>
    {/* Production credentials */}
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">稼働実績</p>
        <h2 className="text-2xl font-extrabold text-white leading-snug">
          「面白いけど動くの？」—
          <br />
          エンタープライズが求める答えを用意しています
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {[
          {
            color: "green" as const,
            badge: "本番稼働中",
            title: "証明書発行 / アンカリング / 保険ポータル",
            body: "コーティング・PPF・鈑金塗装の施工証明書発行、Polygon PoSアンカリング、損保会社向けポータルがすべて実稼働中。",
          },
          {
            color: "blue" as const,
            badge: "第三者監査済み",
            title: "AUDIT_REPORT_20260329 完了",
            body: "外部セキュリティ監査を完了。XSS・SQLインジェクション・TOCTOU対策・RLS設計まで確認済み。",
          },
          {
            color: "none" as const,
            badge: "Polygon PoS",
            title: "ガス代 約$0.001/Tx · PIIはオフチェーン",
            body: "ブロックチェーンに記録するのは施工写真のSHA-256ハッシュのみ。顧客氏名・連絡先などのPIIはSupabaseで管理。GDPRモデルと整合。",
          },
          {
            color: "none" as const,
            badge: "Vercel + Supabase",
            title: "エンタープライズグレードのインフラ",
            body: "Vercel Enterprise・Supabase Teamへの移行に即対応可能。SLA・スケールアップ要件も交渉可能。",
          },
        ].map((item) => (
          <div
            key={item.badge}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-5 flex flex-col gap-2"
          >
            <Chip color={item.color}>{item.badge}</Chip>
            <h3 className="text-sm font-bold text-white leading-snug">{item.title}</h3>
            <p className="text-xs text-white leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  </S>
);

const S6 = (
  <S n={6}>
    {/* Next Step */}
    <div className="flex flex-col items-center justify-center flex-1 text-center px-10 gap-6">
      <Chip>Next Step</Chip>
      <h2 className="text-3xl font-extrabold text-white leading-snug">まず 15分、技術者同士で話しませんか</h2>
      <p className="text-sm text-white max-w-lg leading-relaxed">
        APIドキュメント・スマートコントラクトコード・監査レポートを持参できます。
        <br />
        TBLエコシステムへの統合シナリオを一緒に設計しましょう。
      </p>
      <div className="flex gap-8 mt-2">
        {[
          { n: "1", label: "技術MTG 30分", sub: "API仕様・Tx構造の確認" },
          { n: "2", label: "統合シナリオ設計", sub: "Option A〜Cの選定" },
          { n: "3", label: "PoC → 本番", sub: "実車両でのデータ取得" },
        ].map((step) => (
          <div key={step.n} className="flex flex-col items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-sm font-bold text-white shadow-[0_0_16px_rgba(59,130,246,0.4)]">
              {step.n}
            </div>
            <div className="text-sm font-bold text-white">{step.label}</div>
            <div className="text-xs text-white">{step.sub}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-1 text-xs text-white">
        <span>ledra.co.jp/contact</span>
        <span>Polygon PoS · C2PA · MOBI DID互換 · EVM互換 · Avalanche対応可 · 第三者セキュリティ監査済み</span>
      </div>
    </div>
  </S>
);

// ─── Page ───────────────────────────────────────────────────────

export const metadata = {
  title: "Ledra × Toyota Blockchain Lab | Pitch Deck",
  robots: { index: false, follow: false },
};

const slides: Slide[] = [
  { id: "cover", node: S1 },
  { id: "gap", node: S2 },
  { id: "tech", node: S3 },
  { id: "integration", node: S4 },
  { id: "credentials", node: S5 },
  { id: "next", node: S6 },
];

export default function TblPitchPage() {
  return <PitchDeck slides={slides} label="Toyota Blockchain Lab 向け" />;
}
