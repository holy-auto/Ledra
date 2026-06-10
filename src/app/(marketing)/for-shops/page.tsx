import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { CTAButton } from "@/components/marketing/CTAButton";
import { ScreenshotFrame } from "@/components/marketing/ScreenshotFrame";

export const metadata = {
  title: "施工店の方へ",
  description:
    "コーティング・フィルム・ラッピング施工店のための WEB 施工証明書 SaaS。証明書発行・車両管理・POS・帳票までをLedra一つに。",
  alternates: { canonical: "/for-shops" },
};

const challenges = [
  {
    title: "書類作成に毎日1時間",
    desc: "施工証明書・請求書・領収書の作成、印刷、郵送。職人の手が止まるたびに、売上機会が消えていく。",
  },
  {
    title: "「あの車に何したっけ？」",
    desc: "数ヶ月前の施工内容を探すと、写真はスマホのどこか、記録はExcelのどこか。顧客問合せで焦る。",
  },
  {
    title: "再発行依頼の電話が鳴る",
    desc: "保証書を失くした、保険会社に証明書を出せと言われた。その都度、担当者が時間を取られる。",
  },
  {
    title: "技術が伝わらない",
    desc: "ていねいに施工しても、その品質は口頭と経験則にしか残らない。次の仕事に繋がる形で残らない。",
  },
];

const outcomes = [
  {
    before: "証明書発行に毎回15分",
    after: "スマホで 1タップ、30秒で発行",
  },
  {
    before: "顧客問合せのたびに記録探し",
    after: "顧客ポータルでセルフ閲覧に",
  },
  {
    before: "証明は口頭と経験則",
    after: "QR 付きデジタル証明書で可視化",
  },
  {
    before: "書類の保管スペース",
    after: "すべてクラウドに、検索一発",
  },
];

const certFlowSteps = [
  {
    label: "① 車両を選ぶ",
    url: "admin.ledra.app/certificates/new",
    mock: (
      <div className="p-4 space-y-3">
        <p className="text-[0.625rem] font-semibold text-white uppercase tracking-widest">車両を選択</p>
        <div className="relative">
          <div className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-xs text-white">
            車両番号・名前で検索...
          </div>
        </div>
        {[
          { name: "トヨタ クラウン", plate: "TNG-240-1234", selected: true },
          { name: "BMW 3シリーズ", plate: "品川 500 あ 3344", selected: false },
          { name: "レクサス IS", plate: "横浜 330 め 7890", selected: false },
        ].map((v) => (
          <div
            key={v.plate}
            className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
              v.selected ? "border-blue-500/40 bg-blue-500/10" : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] text-base">🚗</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{v.name}</p>
              <p className="text-[0.625rem] text-white font-mono">{v.plate}</p>
            </div>
            {v.selected && (
              <div className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            )}
          </div>
        ))}
        <button className="w-full rounded-xl bg-blue-600/80 py-2.5 text-xs font-bold text-white">次へ →</button>
      </div>
    ),
  },
  {
    label: "② 施工内容を記録",
    url: "admin.ledra.app/certificates/new/details",
    mock: (
      <div className="p-4 space-y-3">
        <p className="text-[0.625rem] font-semibold text-white uppercase tracking-widest">施工内容を入力</p>
        {[
          { label: "施工種別", value: "ガラスコーティング" },
          { label: "グレード", value: "プレミアム" },
          { label: "施工者", value: "田中 太郎" },
          { label: "施工日", value: "2026-04-29" },
        ].map((row) => (
          <div key={row.label} className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2">
            <p className="text-[0.594rem] text-white uppercase tracking-wide">{row.label}</p>
            <p className="mt-0.5 text-xs font-medium text-white">{row.value}</p>
          </div>
        ))}
        <div>
          <p className="mb-1.5 text-[0.594rem] text-white uppercase tracking-wide">施工写真</p>
          <div className="grid grid-cols-3 gap-1.5">
            {["📸", "📸", "📸"].map((icon, i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-xl"
              >
                {icon}
              </div>
            ))}
          </div>
        </div>
        <button className="w-full rounded-xl bg-blue-600/80 py-2.5 text-xs font-bold text-white">発行する</button>
      </div>
    ),
  },
  {
    label: "③ QRコードで共有",
    url: "admin.ledra.app/certificates/LDR-2026-00842",
    mock: (
      <div className="p-4 flex flex-col items-center text-center space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-emerald-400" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-xs font-bold text-white">証明書を発行しました</p>
          <p className="mt-0.5 text-[0.625rem] font-mono text-white">LDR-2026-00842</p>
        </div>
        <div className="w-24 h-24 rounded-xl border border-white/[0.1] bg-white/[0.04] grid grid-cols-5 gap-0.5 p-2">
          {Array.from({ length: 25 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[1px]"
              style={{
                background: [0, 1, 2, 5, 6, 10, 12, 14, 18, 19, 20, 22, 23, 24].includes(i)
                  ? "rgba(255,255,255,0.7)"
                  : "transparent",
              }}
            />
          ))}
        </div>
        <p className="text-[0.625rem] text-white">スマホをかざして確認</p>
        <div className="flex gap-2 w-full">
          <button className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] py-2 text-[0.625rem] font-medium text-white">
            LINE 送信
          </button>
          <button className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] py-2 text-[0.625rem] font-medium text-white">
            メール送信
          </button>
          <button className="flex-1 rounded-lg border border-white/[0.1] bg-white/[0.04] py-2 text-[0.625rem] font-medium text-white">
            PDF出力
          </button>
        </div>
      </div>
    ),
  },
];

const timelineEvents = [
  {
    time: "9:00",
    title: "入庫チェックイン",
    desc: "前日の予約が自動でチェックイン待ちに。タップひとつで作業開始を記録。",
    tag: "予約管理",
  },
  {
    time: "10:30",
    title: "施工完了・写真撮影",
    desc: "コーティング施工が完了。スマホカメラで施工写真を撮影しながら、C2PA署名が自動で付与されます。",
    tag: "証明書",
  },
  {
    time: "10:35",
    title: "証明書発行（30秒）",
    desc: "車両を選んで施工内容を確認してタップするだけ。写真・施工者・日時が自動で証明書に入ります。",
    tag: "証明書",
    highlight: true,
  },
  {
    time: "10:36",
    title: "顧客にQRコードを送信",
    desc: "LINEまたはメールで証明書URLを送付。顧客はスマホで受け取り、いつでも確認できます。",
    tag: "顧客共有",
  },
  {
    time: "12:00",
    title: "お会計",
    desc: "施工完了後にPOS画面を開いてカード決済。Tap to Payで端末不要、領収書PDFも自動生成。",
    tag: "POS会計",
  },
  {
    time: "15:00",
    title: "問合せ対応",
    desc: "「あの車の施工履歴を見せてほしい」の電話。顧客検索で3秒、タイムラインで全履歴を即答。",
    tag: "顧客管理",
  },
  {
    time: "17:30",
    title: "月次請求書チェック",
    desc: "ダッシュボードで未回収アラートを確認。請求書一括作成・PDF送付もその場で完了。",
    tag: "帳票",
  },
];

const tagColors: Record<string, string> = {
  予約管理: "text-sky-300 bg-sky-500/10 border-sky-500/20",
  証明書: "text-blue-300 bg-blue-500/10 border-blue-500/20",
  顧客共有: "text-violet-300 bg-violet-500/10 border-violet-500/20",
  POS会計: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  顧客管理: "text-amber-300 bg-amber-500/10 border-amber-500/20",
  帳票: "text-rose-300 bg-rose-500/10 border-rose-500/20",
};

const features = [
  {
    title: "デジタル施工証明書",
    description: "写真・施工内容・施工者・日時を証明書としてワンクリック発行。QRコードで顧客に即共有できます。",
    href: "/features/blockchain-anchoring",
  },
  {
    title: "車検証OCR",
    description: "車検証をカメラで撮影するだけで車両情報を自動入力。手入力の手間を大幅に削減します。",
  },
  {
    title: "案件ワークフロー（統合ワークスペース）",
    description: "予約 → 来店 → 作業 → 証明書発行 → 請求 → 入金を1画面で進行管理。次にやることを画面が示します。",
    href: "/features/job-workflow",
  },
  {
    title: "予約・作業管理",
    description: "予約受付からチェックイン、作業進捗、完了までを一元管理。Googleカレンダーとも双方向同期。",
  },
  {
    title: "POS会計・Tap to Pay",
    description: "施工完了後のお会計をその場で。カード・現金・QR・iPhoneのTap to Payにも対応。",
  },
  {
    title: "請求書・帳票",
    description: "請求書をPDFで自動生成、メール送信や共有リンクで顧客に送付。未回収アラート付き。",
  },
  {
    title: "会計連携（freee / マネーフォワード）",
    description: "入金済みの請求書を、お使いの会計ソフトへ自動で仕訳連携。月末の二重入力をなくします。",
    href: "/features/accounting",
  },
  {
    title: "顧客 360°ビュー",
    description: "顧客の車両・施工履歴・予約・請求を一画面で。リピート営業が自然に回る設計です。",
  },
  {
    title: "BtoB受発注（オプション）",
    description:
      "中古車マーケット・受発注・商談管理を一体化したBtoBパック。全プラン共通の追加オプション（¥0/月）として、ご契約と同時に自動で付与されます。",
  },
  {
    title: "NFCタグ連携",
    description: "NFCタグに証明書を紐付け。スマホをかざすだけで施工証明を確認できるプレミアム体験。",
  },
  {
    title: "Ledra Academy（社内教育）",
    description: "教材・クイズ・施工事例で社内教育を仕組み化。受講進捗の追跡と受講証明書の発行まで（Standard / Pro）。",
    href: "/features/academy",
  },
];

const steps = [
  { step: "1", title: "無料アカウント作成", desc: "メールアドレスで無料登録。5分で始められます。" },
  { step: "2", title: "店舗情報を設定", desc: "店舗名・ロゴ・施工メニュー・価格表を登録。テンプレートから選ぶだけ。" },
  { step: "3", title: "証明書を発行してみる", desc: "施工完了後、写真を選んで施工内容を入力。ワンタップで発行。" },
  { step: "4", title: "顧客に共有", desc: "QR コードやURL・LINEで顧客のスマホに証明書を届ける。" },
  { step: "5", title: "有料プランで拡張", desc: "必要に応じてPOS・予約・帳票機能を追加。段階的に運用を拡げられます。" },
];

export default function ForShopsPage() {
  return (
    <>
      <PageHero
        badge="FOR SHOPS"
        title="施工の技術を、証明に変える。"
        subtitle="コーティング・フィルム・ラッピング。一件一件の仕事を、デジタル証明書として積み上げる。事務時間を減らし、顧客の信頼と次の仕事に繋げます。"
      />

      {/* Challenges */}
      <Section bg="alt">
        <SectionHeading
          title="こんな景色、現場にありませんか？"
          subtitle="施工店の1日の時間の使い方は、書類と検索と問合せ対応に多くを取られています。"
        />
        <FeatureGrid className="mt-10">
          {challenges.map((c, i) => (
            <FeatureCard key={c.title} variant="bordered" title={c.title} description={c.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Before/After */}
      <Section>
        <SectionHeading
          title="Ledra を入れると、何が変わるか"
          subtitle="業務の置き換えではなく、『記録のかたちだけ』が変わります。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {outcomes.map((o, i) => (
            <ScrollReveal key={o.before} variant="fade-up" delay={i * 50}>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 md:p-6">
                <div>
                  <p className="text-[0.688rem] uppercase tracking-wider text-white">Before</p>
                  <p className="mt-1.5 text-[0.938rem] text-white leading-relaxed">{o.before}</p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="hidden md:block w-5 h-5 text-blue-300"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
                <div>
                  <p className="text-[0.688rem] uppercase tracking-wider text-blue-300">After</p>
                  <p className="mt-1.5 text-[0.938rem] font-medium text-white leading-relaxed">{o.after}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Certificate flow */}
      <Section bg="alt">
        <SectionHeading
          title="証明書発行、実際の操作はこれだけ"
          subtitle="施工完了後30秒。3ステップで証明書が顧客のスマホに届きます。"
        />
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {certFlowSteps.map((s, i) => (
            <ScrollReveal key={s.label} variant="fade-up" delay={i * 80}>
              <div className="space-y-3">
                <p className="text-xs font-semibold text-blue-300 tracking-wide">{s.label}</p>
                <ScreenshotFrame
                  alt={s.label}
                  url={s.url}
                  aspect="aspect-[9/14]"
                  chrome="macos"
                  sizes="(min-width: 768px) 33vw, 100vw"
                >
                  {s.mock}
                </ScreenshotFrame>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section id="features">
        <SectionHeading
          title="Ledra が提供するもの"
          subtitle="証明書発行だけではありません。施工店の『一日の時間の形』全体を、穏やかに更新します。"
        />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} href={f.href} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Day in the life timeline */}
      <Section bg="alt">
        <SectionHeading title="施工店の1日" subtitle="Ledra を導入した施工店の、ある日の使い方です。" />
        <div className="mx-auto mt-10 max-w-3xl relative">
          {/* Vertical line */}
          <div className="absolute left-[5.5rem] top-0 bottom-0 w-px bg-white/[0.06] hidden md:block" />
          <div className="space-y-4">
            {timelineEvents.map((e, i) => (
              <ScrollReveal key={e.time} variant="fade-up" delay={i * 50}>
                <div
                  className={`flex gap-4 md:gap-6 rounded-2xl border p-4 md:p-5 transition-colors ${
                    e.highlight ? "border-blue-500/30 bg-blue-500/[0.06]" : "border-white/[0.07] bg-white/[0.02]"
                  }`}
                >
                  <div className="w-16 shrink-0 text-right">
                    <span className="text-[0.75rem] font-mono font-medium text-white">{e.time}</span>
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h3 className="text-[0.938rem] font-bold text-white leading-snug">{e.title}</h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.625rem] font-medium border ${tagColors[e.tag] ?? "text-white bg-white/[0.05] border-white/[0.1]"}`}
                      >
                        {e.tag}
                      </span>
                    </div>
                    <p className="text-[0.875rem] leading-[1.75] text-white">{e.desc}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </Section>

      {/* Workflow */}
      <Section>
        <SectionHeading
          title="はじめる流れ"
          subtitle="無料プランで体験できます。本格導入はタイミングをみて、ゆっくり進めてください。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {steps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Blockchain trust teaser */}
      <Section bg="alt">
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-3xl rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 border border-blue-500/25 text-2xl">
                🔗
              </div>
              <div className="flex-1">
                <p className="text-[0.688rem] uppercase tracking-widest text-blue-300 font-semibold mb-2">改ざん検知</p>
                <h3 className="text-[1.125rem] font-bold text-white leading-snug">
                  発行した証明書は、発行後に書き換えられません
                </h3>
                <p className="mt-2 text-[0.875rem] leading-[1.8] text-white">
                  C2PA写真署名とPolygonブロックチェーンにより、施工写真・施工内容が改ざんされると検知されます。
                  保険会社が独立に真正性を確認できるため、査定での信頼性が変わります。
                </p>
              </div>
              <a
                href="/features/blockchain-anchoring"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-medium text-blue-300 hover:bg-blue-500/15 hover:text-blue-200 transition-colors whitespace-nowrap"
              >
                仕組みを見る →
              </a>
            </div>
          </div>
        </ScrollReveal>
      </Section>

      {/* Pilot CTA + Cases placeholder */}
      <Section>
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
            PILOT PROGRAM
          </span>
          <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">
            施工店パイロット参加店舗を募集しています
          </h2>
          <p className="mt-4 text-[0.938rem] md:text-base leading-[1.9] text-white max-w-xl mx-auto">
            先行導入いただく施工店様には、導入支援の無償優遇、事例化とロゴ掲載、機能リクエストの優先反映をご用意しています。
            <br />
            「はじめての1店」として、業界の記録文化を一緒に作り直しませんか。
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <CTAButton variant="primary" href="/contact?role=shop" trackLocation="for-shops-pilot">
              パイロット参加を申し込む
            </CTAButton>
            <CTAButton variant="outline" href="/cases" trackLocation="for-shops-pilot">
              事例ページを見る
            </CTAButton>
          </div>
        </div>
      </Section>

      {/* Resources */}
      <Section bg="alt">
        <SectionHeading
          title="より詳しい情報"
          subtitle="資料でまとめて確認する、料金を見る、シミュレーターで試算する。"
        />
        <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              href: "/resources",
              title: "資料ダウンロード",
              desc: "サービス概要・機能一覧・導入事例集をPDFでお届けします。",
              cta: "資料を請求 →",
              trackLocation: "for-shops-resources",
            },
            {
              href: "/roi",
              title: "ROIシミュレーター",
              desc: "月間発行数と事務時間から、年間削減額を試算します。",
              cta: "試算してみる →",
              trackLocation: "for-shops-roi",
            },
            {
              href: "/pricing",
              title: "料金プラン",
              desc: "無料プランから、運用規模に応じた段階的な料金体系です。",
              cta: "プランを見る →",
              trackLocation: "for-shops-pricing",
            },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-cta-location={item.trackLocation}
              data-cta-label={item.title}
              className="group block rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7 hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors"
            >
              <h3 className="text-[1.063rem] font-bold text-white leading-snug">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white">{item.desc}</p>
              <p className="mt-5 text-xs font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
                {item.cta}
              </p>
            </a>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="スタッフのPC操作が不安です。本当に現場で使えますか？"
            answer="証明書発行の主要操作は、タブレットでタップのみで完結します。キー入力が必要なのは、車両情報の初期登録だけ（しかもOCR自動入力可能）。動画マニュアルも整備しており、新入スタッフも自走できます。"
          />
          <FAQItem
            question="既に使っている Square や POS と一緒に使えますか？"
            answer="はい、Square POS端末と連携可能です（商品マスタ・売上同期を含む）。既存の決済フローを置き換えず、記録と書類発行だけを Ledra に寄せることができます。"
          />
          <FAQItem
            question="お客様から「紙の保証書がほしい」と言われた場合は？"
            answer="証明書はPDFで出力でき、印刷してお渡しいただけます。デジタル版をメインにしつつ、紙との併用運用も可能です。"
          />
          <FAQItem
            question="写真の枚数や容量に制限はありますか？"
            answer="1証明書あたり最大20枚まで添付できます。ストレージはプランごとに異なりますが、Standardプランで月間500GB相当の運用に対応しています。"
          />
          <FAQItem
            question="保険会社から「証明書が本物か確認したい」と言われたら？"
            answer="証明書URLまたはQRコードをそのまま共有するだけで、保険会社側でブロックチェーンによる真正性確認ができます。施工店側での追加作業は不要です。"
          />
          <FAQItem
            question="料金はいくらくらいになりますか？"
            answer={
              <>
                無料プランから開始でき、運用規模に応じて Starter / Standard / Pro があります。詳細は
                <a href="/pricing" className="text-blue-400 underline">
                  料金ページ
                </a>
                をご覧ください。
              </>
            }
          />
        </FAQList>
      </Section>

      <CTABanner
        title="記録を、業界の共通言語にする。"
        subtitle="施工店としての次の10年を、一緒に。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
        tertiaryLabel="デモを見る"
        tertiaryHref="/demo"
        trackLocation="for-shops-final"
      />
    </>
  );
}
