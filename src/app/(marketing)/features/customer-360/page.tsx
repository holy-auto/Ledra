import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "顧客 360° ビュー",
  description:
    "基本情報・車両・証明書・予約・請求書をタブ切替で横断参照。顧客のコンテキストを保ったまま、次のアクションへ。",
  alternates: { canonical: "/features/customer-360" },
};

const problems = [
  {
    title: "顧客情報がシステムをまたいで散在する",
    desc: "「この顧客は何台持っているか」「前回の施工はいつか」「未払い請求はあるか」——それぞれ別の画面を開かないと分からない状況が、接客の質を下げます。",
  },
  {
    title: "来店時に前回の文脈を忘れる",
    desc: "スタッフが変わるたびに、顧客がまた一から説明を求められる。「前回伝えたのに」という積み重ねが、リピート率を静かに下げていきます。",
  },
  {
    title: "次のアクションを考える時間がない",
    desc: "メンテナンス時期・次のアップセル・未回収請求——それぞれ別々に管理していると、見落としが増え、せっかくの顧客関係が機会損失につながります。",
  },
];

const tabs = [
  {
    id: "basic",
    label: "基本情報",
    color: "rgba(59,130,246,",
    items: ["氏名・連絡先・住所", "顧客ランク・ステータス", "メモ・タグ", "登録日・最終来店日"],
  },
  {
    id: "vehicles",
    label: "車両",
    color: "rgba(168,85,247,",
    items: ["紐付き車両の一覧", "メーカー・型式・ナンバー", "車台番号・サイズクラス", "施工件数・最終施工日"],
  },
  {
    id: "certificates",
    label: "証明書",
    color: "rgba(34,197,94,",
    items: ["発行済み証明書の一覧", "有効・無効・複製の状態管理", "Polygon 検証バッジ", "PDFダウンロード・再共有"],
  },
  {
    id: "reservations",
    label: "予約・作業",
    color: "rgba(245,158,11,",
    items: ["過去・現在・未来の予約", "作業ステータス・担当者", "次回メンテナンス予測", "Googleカレンダー同期"],
  },
  {
    id: "invoices",
    label: "請求書",
    color: "rgba(239,68,68,",
    items: ["発行済み請求書の一覧", "支払いステータス", "未払い金額のアラート", "PDF発行・メール送付"],
  },
];

const workflowExamples = [
  {
    scenario: "リピーター来店時",
    steps: [
      "顧客名を検索して 360° ビューを開く",
      "「車両」タブで前回施工した車両とコーティング種別を確認",
      "「予約・作業」タブで前回来店日と施工内容を把握",
      "文脈を把握した状態で接客・見積もりへ",
    ],
  },
  {
    scenario: "未払いフォローアップ時",
    steps: [
      "請求書タブで未払い請求書を特定",
      "基本情報タブで連絡先を確認",
      "その場でメール送付またはLINE通知",
      "支払い後は即座にステータスが更新される",
    ],
  },
  {
    scenario: "メンテナンス提案時",
    steps: [
      "「予約・作業」タブで最終施工日を確認",
      "コーティング種別から推奨メンテ時期を算出",
      "電話・LINE・メールでリマインダーを送付",
      "予約が入ったらタイムラインに即反映",
    ],
  },
];

const features = [
  {
    title: "5タブ横断ビュー",
    description:
      "基本情報・車両・証明書・予約・請求書を一画面に集約。タブ切替だけで全情報にアクセスでき、ページ遷移のたびに文脈を失いません。",
  },
  {
    title: "車両複数台対応",
    description:
      "1顧客が複数台所有している場合も、すべての車両をまとめて管理。家族名義や法人顧客の複数車両も同一顧客に紐付けられます。",
  },
  {
    title: "次回メンテナンス予測",
    description:
      "施工種別・施工日からメンテナンス推奨時期を自動算出。「そろそろ連絡すべき顧客」のリストアップに使えます。",
  },
  {
    title: "リマインダー送付",
    description:
      "メンテナンス時期が近づいた顧客に、LINE・メールでリマインダーを一括送信。フォローアップの工数をゼロに近づけます。",
  },
  {
    title: "CSVエクスポート",
    description: "顧客リスト・施工履歴・請求履歴をCSVで出力。既存のCRMや会計ソフトとの連携・分析に活用できます。",
  },
  {
    title: "検索・フィルタ",
    description: "名前・電話番号・ナンバー・VINで全顧客を横断検索。ステータス・来店日・タグでの絞り込みも可能です。",
  },
];

export default function Customer360Page() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "顧客360°ビュー", url: "/features/customer-360" },
        ]}
      />
      <PageHero
        badge="FEATURE › 顧客 360° ビュー"
        title="顧客のすべてを、1画面で把握する。"
        subtitle="基本情報・保有車両・施工証明書・予約履歴・請求書。これまで別々のシステムに散らばっていた顧客情報を、タブ切替ひとつで横断参照できます。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="コンテキストが途切れると、接客品質が落ちる"
          subtitle="顧客は毎回同じことを一から説明したくはない。担当者は毎回調べ直したくはない。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Tab mockup */}
      <Section>
        <SectionHeading
          title="5タブに集約された顧客情報"
          subtitle="タブを切り替えるだけで、顧客のすべての文脈にアクセスできます。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-2xl">
            {/* Tab bar */}
            <div className="flex overflow-x-auto gap-1 rounded-t-2xl border border-b-0 border-white/[0.1] bg-white/[0.03] p-2">
              {tabs.map((tab, i) => (
                <button
                  key={tab.id}
                  className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                    i === 0 ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "text-white hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content — show first tab */}
            <div className="rounded-b-2xl border border-white/[0.1] bg-white/[0.02] p-5">
              {/* Customer header */}
              <div className="flex items-center gap-4 pb-4 border-b border-white/[0.08]">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/30 to-blue-500/10 text-lg font-bold text-blue-300 border border-blue-500/20">
                  山
                </div>
                <div>
                  <p className="text-base font-bold text-white">山田 太郎</p>
                  <p className="text-xs text-white mt-0.5">090-1234-5678 · t.yamada@example.com</p>
                </div>
                <div className="ml-auto">
                  <span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 text-[0.625rem] font-semibold text-blue-300">
                    ゴールド会員
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[
                  { label: "保有車両", value: "2台" },
                  { label: "施工証明書", value: "8件" },
                  { label: "最終来店", value: "2025-03-01" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-center"
                  >
                    <p className="text-lg font-bold text-white">{stat.value}</p>
                    <p className="text-[0.625rem] text-white mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Vehicles preview */}
              <div className="mt-4">
                <p className="text-[0.625rem] font-semibold text-white uppercase tracking-widest mb-2">保有車両</p>
                <div className="space-y-2">
                  {[
                    { name: "トヨタ アルファード", plate: "品川 300 あ 12-34", certs: "5件" },
                    { name: "BMW 3シリーズ", plate: "横浜 500 め 9900", certs: "3件" },
                  ].map((v) => (
                    <div
                      key={v.plate}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3"
                    >
                      <div className="text-xl">🚗</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{v.name}</p>
                        <p className="text-[0.625rem] text-white font-mono">{v.plate}</p>
                      </div>
                      <span className="text-[0.625rem] text-blue-300 font-medium shrink-0">証明書 {v.certs}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-white">顧客 360° ビューの表示例（イメージ）</p>
          </div>
        </ScrollReveal>
      </Section>

      {/* Workflow examples */}
      <Section bg="alt">
        <SectionHeading title="使われる場面" subtitle="接客・フォローアップ・提案、どの場面でも文脈が揃っています。" />
        <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5">
          {workflowExamples.map((ex, idx) => (
            <ScrollReveal key={ex.scenario} variant="fade-up" delay={idx * 70}>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-full">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-300 mb-4">{ex.scenario}</p>
                <ol className="space-y-2">
                  {ex.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-white">
                      <span className="shrink-0 mt-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/20 text-[0.563rem] font-bold text-blue-300">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section>
        <SectionHeading title="顧客 360° ビューの機能" subtitle="参照・連絡・次アクションが一画面で完結します。" />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section bg="alt">
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="顧客データを既存のシステムから移行できますか？"
            answer="はい。CSVインポートで顧客マスタを一括取り込みできます。氏名・電話番号・メールアドレス・メモ等の基本情報に対応しています。詳細なフォーマットはサポートページをご参照ください。"
          />
          <FAQItem
            question="スタッフごとに見られる顧客情報を制限できますか？"
            answer="はい。Owner / Admin / Staff の役割により、顧客情報へのアクセス範囲を制限できます。たとえばStaff権限では請求書タブを非表示にするといった設定が可能です。"
          />
          <FAQItem
            question="顧客数の上限はありますか？"
            answer="プランごとに上限が異なります。Starterプランでは顧客数に制限がありますが、Standard以上は無制限です。詳細は料金ページをご確認ください。"
          />
          <FAQItem
            question="顧客を削除できますか？"
            answer="顧客に紐付いた証明書・請求書・予約履歴がない場合は削除可能です。施工履歴がある顧客は、監査証跡の保全のため論理削除（非表示化）になります。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="顧客の文脈を、チーム全員で共有する。"
        subtitle="誰が担当しても、前回の記録がすぐ出てくる。Ledra の顧客管理を試してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#vehicle"
        trackLocation="customer-360-cta"
      />
    </>
  );
}
