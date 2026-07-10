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
  title: "案件ワークフロー（統合ワークスペース）",
  description:
    "予約 → 来店 → 作業 → 証明書発行 → 請求 → 入金を1画面で進行管理。ステータスステッパーと次アクションパネルで、案件単位に情報と操作を束ねる Ledra の統合ワークスペースです。",
  alternates: { canonical: "/features/job-workflow" },
};

const problems = [
  {
    title: "画面を行き来して進める",
    desc: "予約はカレンダー、車両は車両画面、証明書は証明書画面、請求は請求画面。1件の案件を進めるのに、何度も画面を移動して情報を突き合わせる必要があります。",
  },
  {
    title: "「次に何をするか」が人に依存",
    desc: "来店したら何をして、作業が終わったら何を出すか。手順が担当者の頭の中にあると、繁忙期や引き継ぎのたびに抜け漏れが起きます。",
  },
  {
    title: "重複発行・二重請求のリスク",
    desc: "すでに証明書を出したか、請求は入金済みか。横断で確認しないと、同じ案件に証明書や請求書を二重に作ってしまうことがあります。",
  },
];

const stages = [
  { key: "confirmed", label: "予約確定", desc: "受付した予約を案件として起票" },
  { key: "arrived", label: "来店", desc: "チェックインして作業準備へ" },
  { key: "in_progress", label: "作業中", desc: "工程テンプレートに沿って進行" },
  { key: "completed", label: "完了", desc: "証明書・請求へワンタップ" },
];

const flowSteps = [
  {
    step: "1",
    title: "予約を「案件」として開く",
    desc: "受け付けた予約は、そのまま案件（Job）として1つのワークスペースになります。紐付く顧客・車両・メニュー・概算金額が、サーバー側で並列に集約されて1画面に表示されます。",
  },
  {
    step: "2",
    title: "ステータスを1クリックで進める",
    desc: "予約確定 → 来店 → 作業中 → 完了。現在の状態がステッパーで可視化され、ボタン一つで次のステータスへ。工程テンプレートを適用すれば、施工種別ごとの標準手順がそのまま並びます。",
  },
  {
    step: "3",
    title: "次アクションへワンタップ",
    desc: "状態に応じて「証明書を発行」「請求書を作成」「顧客詳細」「車両詳細」へ即移動。証明書発行では車両ID・顧客IDを引き継ぐので、入力済みの情報を打ち直す必要はありません。",
  },
  {
    step: "4",
    title: "証明書・請求・入金まで一望",
    desc: "サマリ / 顧客・車両 / 証明書 / 請求・見積 のタブで、この案件に紐付く帳票を横断表示。発行済み・入金済みはボタンに明示され、過剰な発行や二重請求を抑止します。",
  },
];

const capabilityCards = [
  {
    title: "1画面に情報と操作を束ねる",
    description:
      "予約をハブに、顧客・車両・証明書・請求書を横断取得。案件のコンテキストを保ったまま、次の操作に進めます。画面の行き来がなくなります。",
  },
  {
    title: "ステータスステッパーで進行を可視化",
    description:
      "確定 → 来店 → 作業中 → 完了を可視化し、1クリックで進行。いまどの案件がどこまで進んでいるかが、担当者以外にも一目で分かります。",
  },
  {
    title: "次アクションパネル",
    description:
      "現在の状態に応じて、やるべきことだけをボタンで提示。証明書発行・請求作成・顧客/車両参照へ、迷わずワンタップで移動できます。",
  },
  {
    title: "重複検知でミスを抑止",
    description:
      "有効な証明書がある／請求が入金済みの場合はボタンに「発行済」「入金済あり」を表示。二重発行・二重請求を未然に防ぎます。",
  },
];

export default function JobWorkflowPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "案件ワークフロー", url: "/features/job-workflow" },
        ]}
      />
      <PageHero
        badge="FEATURE › 案件ワークフロー"
        title="予約から入金まで、1つの画面で。"
        subtitle="予約 → 来店 → 作業 → 証明書発行 → 請求 → 入金。散らばっていた情報と操作を、案件単位の統合ワークスペースに束ねます。次にやることは、画面が教えてくれます。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="1件の案件が、いくつもの画面に散らばる"
          subtitle="情報を突き合わせる時間と、抜け漏れのリスクが積み重なります。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Status stepper visual */}
      <Section>
        <SectionHeading
          title="案件の進行を、ステッパーで"
          subtitle="いまどこまで進んでいるか。状態が一目で分かります。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 sm:grid-cols-4 gap-3">
            {stages.map((s, i) => (
              <div
                key={s.key}
                className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-center"
              >
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/25 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/25">
                  {i + 1}
                </div>
                <p className="mt-3 text-sm font-bold text-white">{s.label}</p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-white">{s.desc}</p>
                <p className="mt-2 font-mono text-[0.625rem] text-blue-300/80">{s.key}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* Flow */}
      <Section bg="alt">
        <SectionHeading title="開いてから完了まで" subtitle="案件を開けば、必要な情報と次の一手がそろっています。" />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {flowSteps.map((s, i) => (
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

      {/* Capabilities */}
      <Section>
        <SectionHeading title="統合ワークスペースの要点" subtitle="現場の業務フローを、そのまま画面に映します。" />
        <FeatureGrid className="mt-10">
          {capabilityCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section bg="alt">
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="予約を受けていない飛び込みの作業でも使えますか？"
            answer="はい。予約から始まる案件のほか、その場で発生した飛び込み案件も起票して同じワークスペースで進行管理できます。"
          />
          <FAQItem
            question="工程テンプレートとは何ですか？"
            answer="コーティング・PPF・ラッピング・板金修理など、施工種別ごとの標準工程をテンプレート化したものです。案件開始時に適用すると、作業ステップが自動で並びます。テンプレートは施工種別ごとに自店で編集できます。"
          />
          <FAQItem
            question="証明書や請求書は、この画面から発行できますか？"
            answer="はい。次アクションパネルから証明書発行・請求書作成に進めます。車両IDや顧客IDは案件から引き継がれるため、再入力は不要です。"
          />
          <FAQItem
            question="二重に証明書や請求書を作ってしまう心配はありませんか？"
            answer="案件に有効な証明書がある場合や、請求が入金済みの場合は、ボタンに「発行済」「入金済あり」と表示されます。重複の発行・請求を未然に抑止できます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="案件の進行を、迷わない形に。"
        subtitle="予約から入金まで、ひとつの画面で。Ledra の統合ワークスペースを試してみてください。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#operations"
        trackLocation="job-workflow-cta"
      />
    </>
  );
}
