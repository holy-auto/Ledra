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

const features = [
  {
    title: "デジタル施工証明書",
    description:
      "写真・施工内容・施工者・日時を証明書としてワンクリック発行。QRコードで顧客に即共有できます。",
  },
  {
    title: "車検証OCR",
    description:
      "車検証をカメラで撮影するだけで車両情報を自動入力。手入力の手間を大幅に削減します。",
  },
  {
    title: "予約・作業管理",
    description:
      "予約受付からチェックイン、作業進捗、完了までを一元管理。Googleカレンダーとも双方向同期。",
  },
  {
    title: "POS会計・Tap to Pay",
    description:
      "施工完了後のお会計をその場で。カード・現金・QR・iPhoneのTap to Payにも対応。",
  },
  {
    title: "請求書・帳票",
    description:
      "請求書をPDFで自動生成、メール送信や共有リンクで顧客に送付。未回収アラート付き。",
  },
  {
    title: "顧客 360°ビュー",
    description:
      "顧客の車両・施工履歴・予約・請求を一画面で。リピート営業が自然に回る設計です。",
  },
  {
    title: "BtoB受発注",
    description:
      "他の施工店と連携。得意分野を活かした仕事の受発注がプラットフォーム上で完結します。",
  },
  {
    title: "NFCタグ連携",
    description:
      "NFCタグに証明書を紐付け。スマホをかざすだけで施工証明を確認できるプレミアム体験。",
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
            <FeatureCard
              key={c.title}
              variant="bordered"
              title={c.title}
              description={c.desc}
              delay={i * 70}
            />
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
                  <p className="text-[0.688rem] uppercase tracking-wider text-white/75">Before</p>
                  <p className="mt-1.5 text-[0.938rem] text-white/80 leading-relaxed">{o.before}</p>
                </div>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="hidden md:block w-5 h-5 text-blue-300/50"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
                <div>
                  <p className="text-[0.688rem] uppercase tracking-wider text-blue-300">After</p>
                  <p className="mt-1.5 text-[0.938rem] font-medium text-white leading-relaxed">
                    {o.after}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section bg="alt" id="features">
        <SectionHeading
          title="Ledra が提供するもの"
          subtitle="証明書発行だけではありません。施工店の『一日の時間の形』全体を、穏やかに更新します。"
        />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
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
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white/80">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Pilot CTA + Cases placeholder */}
      <Section bg="alt">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
            PILOT PROGRAM
          </span>
          <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">
            施工店パイロット参加店舗を募集しています
          </h2>
          <p className="mt-4 text-[0.938rem] md:text-base leading-[1.9] text-white/80 max-w-xl mx-auto">
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
      <Section>
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
              <p className="mt-3 text-sm leading-relaxed text-white/80">{item.desc}</p>
              <p className="mt-5 text-xs font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
                {item.cta}
              </p>
            </a>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section bg="alt">
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
        tertiaryHref="/contact?role=shop"
        trackLocation="for-shops-final"
      />
    </>
  );
}
