import { Section } from "@/components/marketing/Section";
import { Container } from "@/components/marketing/Container";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import Link from "next/link";

export const metadata = {
  title: "Ledra × Toyota PoC | 車両施工証明のブロックチェーン化",
  description:
    "Ledraが提供する施工証明インフラとトヨタのブロックチェーン戦略の接点。PoC概要と技術的実現性をご説明します。",
  robots: { index: false, follow: false },
};

// ─── 共通スタイル ──────────────────────────────────────────────
const card =
  "bg-white/[0.04] backdrop-blur-sm rounded-2xl p-7 border border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.14] transition-all duration-300";
const badge =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold";
const divider = "border-t border-white/[0.07] my-8";

// ─── 小コンポーネント ──────────────────────────────────────────
function Chip({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "green" | "purple" | "amber" }) {
  const cls: Record<string, string> = {
    blue:   "border-blue-500/30   bg-blue-500/10   text-blue-300",
    green:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    purple: "border-purple-500/30  bg-purple-500/10  text-purple-300",
    amber:  "border-amber-500/30   bg-amber-500/10   text-amber-300",
  };
  return <span className={`${badge} ${cls[color]}`}>{children}</span>;
}

function StepDot({ n }: { n: number }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-[0_0_16px_rgba(59,130,246,0.4)]">
      {n}
    </div>
  );
}

function TxLine({ hash }: { hash: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white/[0.03] border border-white/[0.06] px-3 py-2 font-mono text-xs text-white/40">
      <svg className="h-3.5 w-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="truncate">{hash}</span>
    </div>
  );
}

// ─── ページ ────────────────────────────────────────────────────
export default function PocPage() {
  return (
    <div className="bg-[#060a12]">

      {/* ━━━ 1. ヒーロー ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden bg-[#060a12] pt-32 pb-24 md:pt-40 md:pb-32">
        {/* 背景グラデーション */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[160px]" />
        </div>
        <Container className="relative text-center">
          <ScrollReveal variant="blur-in">
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              <Chip color="blue">Toyota Blockchain Lab</Chip>
              <Chip color="green">Polygon PoS</Chip>
              <Chip color="purple">C2PA</Chip>
              <Chip color="amber">PoC 2026</Chip>
            </div>
            <h1 className="text-[2.25rem] font-extrabold leading-[1.15] tracking-tight text-white md:text-[3.5rem]">
              施工記録の信頼性を、<br />
              <span className="bg-gradient-to-r from-blue-400 to-blue-200 bg-clip-text text-transparent">
                ブロックチェーンで証明する
              </span>
            </h1>
            <p className="mt-6 text-base leading-relaxed text-white/50 md:text-lg max-w-2xl mx-auto">
              Ledra は、コーティング・PPF・鈑金塗装などの施工証明書を
              C2PA 署名と Polygon ブロックチェーンで改ざん検知可能にし、
              VIN 単位で車両全体の施工履歴を集約するインフラです。
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a href="#poc" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.4)] transition hover:bg-blue-500 no-underline">
                PoC 内容を見る
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </a>
              <a href="#demo" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08] no-underline">
                デモを見る
              </a>
            </div>
          </ScrollReveal>
        </Container>
      </section>

      {/* ━━━ 2. 課題 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Section bg="alt">
        <SectionHeading
          title="アフターマーケット施工証明の現状課題"
          subtitle="車両の製造から廃棄まで追跡するブロックチェーン構想において、施工記録は今も「空白地帯」です"
        />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              label: "課題①",
              title: "改ざん可能な証明書",
              body: "現状の施工証明書は紙または PDF で発行され、写真の差し替えや内容の書き換えを検知する手段がない。査定・保険審査で信頼されにくい。",
              color: "amber" as const,
            },
            {
              label: "課題②",
              title: "施工履歴の分断",
              body: "コーティング店 A、PPF 店 B、鈑金塗装店 C — 異なる店舗に分散した施工記録は集約されず、車両の「真の状態」が中古車市場に伝わらない。",
              color: "amber" as const,
            },
            {
              label: "課題③",
              title: "中古車価値への未反映",
              body: "PPF 施工や高品質コーティングは車両の傷・劣化を防ぐが、証明できないため査定額への反映がなく、オーナーのケア投資が報われない。",
              color: "amber" as const,
            },
          ].map((item, i) => (
            <ScrollReveal key={item.label} variant="fade-up" delay={i * 120}>
              <div className={card}>
                <Chip color={item.color}>{item.label}</Chip>
                <h3 className="mt-4 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{item.body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* ━━━ 3. Ledra の仕組み ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Section bg="white">
        <SectionHeading
          title="Ledra の仕組み"
          subtitle="施工完了から車両パスポート公開まで、完全自動でブロックチェーン証明が完結します"
        />
        <div className="space-y-5">
          {[
            {
              n: 1,
              title: "施工完了 → 証明書発行",
              body: "施工店がスマホ・PC から Ledra 管理画面を開き、施工内容と写真を登録。ワンクリックで QR コード付き施工証明書が生成されます。",
            },
            {
              n: 2,
              title: "C2PA 署名 + SHA-256 ハッシュ",
              body: "施工写真に C2PA マニフェストが埋め込まれ（撮影デバイス・日時・編集履歴を記録）、同時に SHA-256 ハッシュが計算されます。",
            },
            {
              n: 3,
              title: "Polygon ブロックチェーンにアンカー",
              body: "SHA-256 ハッシュが Polygon PoS スマートコントラクトに送信され、トランザクションハッシュが DB に保存されます。この時点で、写真の改ざんは永久に検知可能になります。",
            },
            {
              n: 4,
              title: "車両パスポートに自動集約",
              body: "VIN（車台番号）を持つ証明書のアンカーが完了すると、/v/[VIN] に「車両デジタルパスポート」が自動生成されます。施工店をまたいで施工履歴が一本のタイムラインに集約されます。",
            },
          ].map((step, i) => (
            <ScrollReveal key={step.n} variant="fade-up" delay={i * 100}>
              <div className={`${card} flex gap-5`}>
                <StepDot n={step.n} />
                <div>
                  <div className="font-bold text-white">{step.title}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/50">{step.body}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* ━━━ 4. 車両デジタルパスポート ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Section bg="alt" id="demo">
        <SectionHeading
          title="車両デジタルパスポート /v/[VIN]"
          subtitle="VIN を URL に入れるだけで、その車両のブロックチェーン証明済み施工履歴が誰でも確認できます"
        />
        <div className="grid gap-6 md:grid-cols-2">

          {/* パスポートページのモック */}
          <ScrollReveal variant="fade-right">
            <div className="rounded-2xl border border-white/[0.1] bg-[#0d1220] overflow-hidden">
              {/* ブラウザバー */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/60" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                  <div className="h-3 w-3 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 rounded-md bg-white/[0.05] px-3 py-1 text-center font-mono text-xs text-white/30">
                  ledra.co.jp/v/JT2BF22K1W0066983
                </div>
              </div>
              {/* コンテンツ */}
              <div className="p-5 space-y-4">
                <div>
                  <div className="text-lg font-bold text-white">Toyota Alphard 2024</div>
                  <div className="font-mono text-xs text-white/30 mt-0.5">VIN: JT2BF22K1W0066983</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip color="green">アンカー済み施工証明 3件</Chip>
                  <Chip color="blue">関与施工店 2店</Chip>
                  <span className={`${badge} border-white/10 text-white/30`}>初回登録 2024年6月</span>
                </div>
                <div className="space-y-3">
                  {[
                    { date: "2024-06-15", type: "セラミックコーティング", shop: "Woven City モビリティセンター" },
                    { date: "2024-09-03", type: "PPF施工（フロント）",      shop: "Woven City モビリティセンター" },
                    { date: "2025-02-20", type: "車両整備",                shop: "トヨタモビリティ東京" },
                  ].map((cert, i) => (
                    <div key={i} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-emerald-500 bg-emerald-500/20" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white">{cert.type}</span>
                          <Chip color="green">Polygon済</Chip>
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">{cert.shop} · {cert.date}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <TxLine hash="0x7f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c..." />
                <div className="text-xs text-white/20">
                  この証明書の真正性は Polygon PoS ネットワーク上で検証可能です
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* 特徴リスト */}
          <div className="flex flex-col gap-4">
            {[
              {
                title: "テナント横断で自動集約",
                body: "A 店でコーティング、B 店で PPF — 複数の施工店の記録が同一 VIN のパスポートに自動的にまとめられます。",
                color: "blue" as const,
              },
              {
                title: "第三者が検証可能",
                body: "URL を共有するだけで、保険会社・中古車査定担当者・次のオーナーが施工記録の真正性を確認できます。",
                color: "green" as const,
              },
              {
                title: "NFC タグとの連携",
                body: "車両に貼付した NFC タグをスキャンすると、パスポートページに即時アクセス。スマホ一つで証明書を確認できます。",
                color: "purple" as const,
              },
              {
                title: "プライバシー保護",
                body: "ブロックチェーンに記録するのは写真のハッシュ値のみ。顧客氏名・メールアドレスはオフチェーンで管理され、公開ページでは自動マスクされます。",
                color: "amber" as const,
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} variant="fade-left" delay={i * 100}>
                <div className={card}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                      item.color === "blue" ? "bg-blue-400" :
                      item.color === "green" ? "bg-emerald-400" :
                      item.color === "purple" ? "bg-purple-400" : "bg-amber-400"
                    }`} />
                    <div>
                      <div className="font-semibold text-white">{item.title}</div>
                      <p className="mt-1 text-sm leading-relaxed text-white/50">{item.body}</p>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </Section>

      {/* ━━━ 5. トヨタとの接点 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Section bg="white">
        <SectionHeading
          title="トヨタのブロックチェーン戦略との接点"
          subtitle="TBL が描く「車両ライフサイクル全体のブロックチェーン記録」の空白を、Ledra が即座に埋めます"
        />

        {/* ライフサイクル図 */}
        <ScrollReveal variant="fade-up">
          <div className="mb-12 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">車両ライフサイクルとカバレッジ</div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: "製造・出荷", covered: true,  who: "TBL" },
                { label: "→", sep: true },
                { label: "ディーラー整備", covered: true,  who: "TBL" },
                { label: "→", sep: true },
                { label: "アフター施工", covered: false, who: "Ledra" },
                { label: "→", sep: true },
                { label: "中古車売買", covered: true,  who: "MON" },
                { label: "→", sep: true },
                { label: "廃車", covered: true,  who: "TBL" },
              ].map((item, i) =>
                item.sep ? (
                  <span key={i} className="text-white/20 text-lg">→</span>
                ) : (
                  <div key={i} className={`rounded-xl border px-4 py-3 text-center ${
                    item.covered
                      ? "border-white/[0.1] bg-white/[0.04] text-white/60"
                      : "border-blue-500/40 bg-blue-500/15 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                  }`}>
                    <div className="text-sm font-bold">{item.label}</div>
                    <div className={`text-xs mt-0.5 font-mono ${item.covered ? "text-white/30" : "text-blue-400"}`}>
                      {item.who}
                    </div>
                    {!item.covered && (
                      <div className="text-[10px] mt-1 text-blue-400 font-semibold">← 空白地帯</div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </ScrollReveal>

        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              tag: "Toyota Blockchain Lab",
              color: "blue" as const,
              title: "TBL エコシステム統合",
              body: "Ledra の Polygon Tx ハッシュを TBL 車両履歴データベースに登録する API 連携。MOBI DID（車両分散型識別子）との互換性も確保し、アフター施工記録を車両ライフサイクルデータに組み込みます。",
            },
            {
              tag: "KINTO",
              color: "purple" as const,
              title: "KINTO スコアリング連携",
              body: "KINTO 加入者が認定施工店でコーティング・PPF を施工した際、Ledra 証明書を KINTO スコアに反映。施工実績が保険料割引・特典付与に繋がる仕組みを設計します。",
            },
            {
              tag: "Woven City",
              color: "green" as const,
              title: "Woven City パイロット",
              body: "Woven City 内の整備・施工施設に Ledra を導入（費用は Ledra 負担）。入居者・訪問者の車両 VIN に施工証明を発行し、NFC タグ → 車両パスポートの体験を実証します。",
            },
          ].map((item, i) => (
            <ScrollReveal key={item.tag} variant="fade-up" delay={i * 120}>
              <div className={card}>
                <Chip color={item.color}>{item.tag}</Chip>
                <h3 className="mt-4 text-lg font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{item.body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* ━━━ 6. PoC 内容 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Section bg="alt" id="poc">
        <SectionHeading
          title="PoC の進め方"
          subtitle="最小限のコミットメントで、最大限のデータを得られるよう設計されています"
        />
        <div className="grid gap-8 lg:grid-cols-2">

          {/* PoC スコープ */}
          <ScrollReveal variant="fade-right">
            <div className={card}>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-5">PoC スコープ</div>
              <div className="space-y-4">
                {[
                  { label: "期間", value: "3ヶ月" },
                  { label: "対象", value: "Woven City 施設 1 拠点（または指定施設）" },
                  { label: "費用", value: "Ledra サブスクリプション費用：無償提供" },
                  { label: "必要なコミットメント", value: "NDA + PoC 合意書（本番採用の義務なし）" },
                  { label: "提供データ", value: "週次レポート（発行数・アンカー成功率・パスポートアクセス数）" },
                ].map((row) => (
                  <div key={row.label} className={divider.replace("my-8", "")}>
                    <div className="text-xs text-white/30 mb-1">{row.label}</div>
                    <div className="text-sm font-semibold text-white">{row.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* 成功指標 */}
          <ScrollReveal variant="fade-left">
            <div className={card}>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-5">PoC 成功指標（3ヶ月）</div>
              <div className="space-y-4">
                {[
                  { metric: "発行証明書数",            target: "50件以上",   desc: "実際に使われた証拠" },
                  { metric: "Polygon アンカー成功率",   target: "95%以上",    desc: "システム信頼性の検証" },
                  { metric: "車両パスポート発行数",     target: "30 VIN以上", desc: "「Ledra証明付き車両」の創出" },
                  { metric: "パスポートページ閲覧数",   target: "延べ100回",  desc: "外部からの参照実績" },
                  { metric: "スタッフ継続利用率",       target: "3ヶ月継続",  desc: "業務フローへの定着確認" },
                ].map((row) => (
                  <div key={row.metric} className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{row.metric}</div>
                      <div className="text-xs text-white/30">{row.desc}</div>
                    </div>
                    <Chip color="green">{row.target}</Chip>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>

        {/* PoC フロー */}
        <div className="mt-10">
          <div className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-6 text-center">PoC 運用フロー</div>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-0">
            {[
              { from: "施工完了", arrow: false },
              { from: "→", arrow: true },
              { from: "Ledra で証明書発行\n（写真 + 施工内容）", arrow: false },
              { from: "→", arrow: true },
              { from: "C2PA 署名\n+ Polygon アンカー", arrow: false },
              { from: "→", arrow: true },
              { from: "車両パスポート\n自動更新", arrow: false },
              { from: "→", arrow: true },
              { from: "QR / NFC で\n第三者が検証", arrow: false },
            ].map((item, i) =>
              item.arrow ? (
                <div key={i} className="flex items-center justify-center px-2 text-white/20 text-2xl">→</div>
              ) : (
                <div
                  key={i}
                  className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-center text-xs font-semibold text-white whitespace-pre-line"
                >
                  {item.from}
                </div>
              )
            )}
          </div>
        </div>
      </Section>

      {/* ━━━ 7. 技術信頼性 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Section bg="white">
        <SectionHeading
          title="技術的信頼性の根拠"
          subtitle="「面白いけど動くの？」— エンタープライズ採用に必要な答えを用意しています"
        />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: "稼働実績",
              value: "本番稼働中",
              note: "証明書発行・Polygon アンカリング・保険会社ポータルが実環境で稼働",
              color: "green" as const,
            },
            {
              label: "セキュリティ",
              value: "監査済み",
              note: "第三者セキュリティ監査（AUDIT_REPORT_20260329）を完了。XSS/SQLi/TOCTOU 対策確認済み",
              color: "blue" as const,
            },
            {
              label: "ブロックチェーン",
              value: "Polygon PoS",
              note: "ガス代 約$0.001/Tx。写真のSHA-256ハッシュのみを記録（PIIはオフチェーン）",
              color: "purple" as const,
            },
            {
              label: "スケーラビリティ",
              value: "Vercel + Supabase",
              note: "エンタープライズグレードのインフラ。SLA・スケールアップにも即対応可能",
              color: "amber" as const,
            },
          ].map((item, i) => (
            <ScrollReveal key={item.label} variant="scale-up" delay={i * 80}>
              <div className={card}>
                <Chip color={item.color}>{item.label}</Chip>
                <div className="mt-3 text-2xl font-extrabold text-white">{item.value}</div>
                <p className="mt-2 text-xs leading-relaxed text-white/40">{item.note}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        <ScrollReveal variant="fade-up" delay={300}>
          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <div className="text-xs font-semibold uppercase tracking-widest text-white/30 mb-4">FAQ — よくある懸念事項</div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                {
                  q: "トヨタ独自の Avalanche (MON) と Polygon の互換性は？",
                  a: "施工証明のハッシュはチェーン非依存データです。必要であれば Avalanche への二重記録や、将来の TBL 仕様に合わせたチェーン変更も技術的に対応可能です。",
                },
                {
                  q: "顧客の個人情報はブロックチェーンに載るのか？",
                  a: "いいえ。ブロックチェーンに記録するのは施工写真の SHA-256 ハッシュのみです。氏名・連絡先などの PII はオフチェーン（Supabase）で管理し、公開ページでは自動マスク処理されます。",
                },
                {
                  q: "スタートアップだが大企業との連携に耐えられるか？",
                  a: "本番稼働中のシステムで第三者監査済みです。Vercel Enterprise・Supabase Team への移行も即対応可能。Stripe・Polygon など実績あるパートナーのインフラを採用しています。",
                },
                {
                  q: "TBLOCK SIGN（R3 Corda）との競合関係は？",
                  a: "TBLOCK SIGN はサプライチェーン向け電子契約。Ledra はアフターマーケット施工証明です。対象領域が異なるため競合ではなく補完関係にあります。",
                },
              ].map((item) => (
                <div key={item.q} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="text-sm font-semibold text-white mb-2">Q. {item.q}</div>
                  <div className="text-xs leading-relaxed text-white/40">A. {item.a}</div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </Section>

      {/* ━━━ 8. ネクストステップ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <section className="relative overflow-hidden bg-[#060a12] py-24 md:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 bottom-0 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[120px]" />
        </div>
        <Container className="relative text-center">
          <ScrollReveal variant="blur-in">
            <div className="mb-6">
              <Chip color="blue">Next Step</Chip>
            </div>
            <h2 className="text-[2rem] font-extrabold leading-[1.2] tracking-tight text-white md:text-[3rem]">
              まず 15 分、話しませんか
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/50 max-w-xl mx-auto">
              長文の提案書も、複雑な契約も必要ありません。
              デモを見ていただき、PoC に関心があれば NDA のみで始められます。
            </p>
            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.4)] transition hover:bg-blue-500 no-underline"
              >
                お問い合わせ
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <a
                href="/v/DEMO-VIN-001"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-8 py-4 text-sm font-bold text-white transition hover:bg-white/[0.08] no-underline"
              >
                デモパスポートを見る
              </a>
            </div>

            <div className={`${divider} max-w-lg mx-auto mt-12`} />

            <div className="flex flex-wrap justify-center gap-6 text-xs text-white/25">
              <span>Toyota Blockchain Lab 連携</span>
              <span>·</span>
              <span>KINTO スコアリング統合</span>
              <span>·</span>
              <span>Woven City パイロット</span>
              <span>·</span>
              <span>ディーラー展開</span>
            </div>
          </ScrollReveal>
        </Container>
      </section>

    </div>
  );
}
