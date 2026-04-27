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
  title: "保険会社の方へ",
  description:
    "施工証明書の真正性確認を、数秒で。Ledra は保険会社の査定担当に、改ざん検知付きデジタル証明書と案件管理機能を提供します。",
  alternates: { canonical: "/for-insurers" },
};

const challenges = [
  {
    title: "電話・FAXでの確認往復",
    desc: "紙の証明書を信じてよいか、施工店に電話確認。担当者の手で待ち時間が発生し、査定が滞留する。",
  },
  {
    title: "改ざん・水増しのリスク",
    desc: "PDF や写真は容易に編集できる。本当に施工が行われたのか、後から判別する手段が乏しい。",
  },
  {
    title: "属人化する案件管理",
    desc: "案件のメッセージ・添付ファイル・対応履歴が担当者の手元に散在。引き継ぎや繁忙期に綻ぶ。",
  },
  {
    title: "監査対応のたびに掘り起こし",
    desc: "誰がいつ何を閲覧したのか、操作ログを後から再構成するのに時間がかかる。",
  },
];

const outcomes = [
  { before: "電話・FAX で真贋確認", after: "Public ID 検索で数秒で照会" },
  { before: "PDF の改ざん検知不可", after: "Polygon anchoring で改変を検知" },
  { before: "案件情報が担当者の手元に", after: "案件管理で全員が同じ情報を共有" },
  { before: "監査対応のたびに掘り起こし", after: "操作ログを常時記録、即出力" },
];

const securityHighlights = [
  {
    title: "Polygon anchoring",
    description:
      "発行された証明書のハッシュを Polygon ブロックチェーンに刻印。後からデータが書き換えられても、第三者検証で不整合を検知できます。",
  },
  {
    title: "C2PA 画像署名",
    description:
      "施工写真にコンテンツクレデンシャルを埋め込み。SNS や別経路で流通しても、出自を追跡可能に。",
  },
  {
    title: "Row Level Security",
    description:
      "Supabase の RLS を全テーブルで有効化。テナント・役割・所有者の3軸で、SQL レイヤでアクセス制限。",
  },
  {
    title: "完全な操作ログ",
    description:
      "閲覧・検索・案件操作のすべてを監査ログとして保存。コンプライアンス対応を即時化。",
  },
];

const features = [
  {
    title: "証明書検索",
    description:
      "Public ID・顧客名・車両情報・ナンバーで証明書を即検索。ステータス・日付・施工内容での絞り込みも。",
  },
  {
    title: "案件管理",
    description:
      "問い合わせから査定完了までを案件として管理。メッセージ・添付・テンプレートで効率化。",
  },
  {
    title: "自動振り分け",
    description:
      "ルールベースで案件を担当者に自動アサイン。SLA管理で対応漏れを防止します。",
  },
  {
    title: "ウォッチリスト",
    description:
      "気になる証明書をウォッチリストに登録。ステータス変更時に自動通知。",
  },
  {
    title: "分析レポート",
    description:
      "検索パターン分析、案件処理統計、施工店別の傾向把握。査定業務の品質改善に。",
  },
  {
    title: "監査ログ",
    description:
      "誰がいつ何を閲覧・操作したかを完全記録。コンプライアンス・内部監査に対応。",
  },
  {
    title: "API連携",
    description:
      "既存の損害サービスシステム・基幹システムと API で連携可能。バッチ照会も対応。",
  },
  {
    title: "ロール管理",
    description:
      "Owner / Admin / Adjuster / Viewer の役割別権限。チームの規模・組織に合わせた運用が可能。",
  },
];

const steps = [
  {
    step: "1",
    title: "オンライン申込",
    desc: "法人番号を入力して企業情報を自動取得。メール認証で本人確認まで完了。",
  },
  { step: "2", title: "プラン選択", desc: "Basic / Pro / Enterprise の3プランから選択。トライアル可能。" },
  {
    step: "3",
    title: "チーム招待・ロール設定",
    desc: "査定担当者を CSV 一括または個別招待。ロール（Adjuster / Reviewer 等）を設定。",
  },
  {
    step: "4",
    title: "運用開始",
    desc: "証明書検索・案件管理を即座に開始。導入支援チームが初期運用を伴走します。",
  },
  {
    step: "5",
    title: "API・基幹連携",
    desc: "Pro 以上は API 連携や独自ルール設定が可能。要件次第で個別対応。",
  },
];

export default function ForInsurersPage() {
  return (
    <>
      <PageHero
        badge="FOR INSURERS"
        title="施工証明の確認を、一瞬で。"
        subtitle="保険金請求時の施工証明書の真贋を、数秒で確認。改ざん検知付きデジタル証明書と、案件・監査・分析のための保険会社ポータルを提供します。"
      />

      {/* Challenges */}
      <Section bg="alt">
        <SectionHeading
          title="査定現場で見えてきた課題"
          subtitle="施工内容の確認・案件追跡・監査対応に、本来不要な時間が積み重なっています。"
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
          title="Ledra で、業務はこう変わる"
          subtitle="既存の損害サービスシステムを置き換えるのではなく、施工側の事実を確実に届けます。"
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

      {/* Security highlights */}
      <Section bg="alt">
        <SectionHeading
          title="改ざんを検知できる、技術の根拠"
          subtitle="信頼を口約束ではなく、検証可能な仕組みとして提供します。"
        />
        <FeatureGrid className="mt-10">
          {securityHighlights.map((s, i) => (
            <FeatureCard
              key={s.title}
              variant="bordered"
              title={s.title}
              description={s.description}
              delay={i * 60}
            />
          ))}
        </FeatureGrid>
        <div className="mt-10 text-center">
          <CTAButton
            variant="outline"
            href="/security"
            trackLocation="for-insurers-security"
          >
            セキュリティの全体像を見る →
          </CTAButton>
        </div>
      </Section>

      {/* Features */}
      <Section id="features">
        <SectionHeading
          title="保険会社ポータルの機能"
          subtitle="査定担当・審査担当の業務に必要な機能を、一画面に揃えています。"
        />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Workflow */}
      <Section bg="alt">
        <SectionHeading
          title="導入の流れ"
          subtitle="オンライン申込から運用開始まで、最短で2週間。要件次第で個別カスタマイズも。"
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

      {/* Pilot CTA */}
      <Section>
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
            PILOT PROGRAM
          </span>
          <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">
            保険会社パイロットの参加企業を募集中
          </h2>
          <p className="mt-4 text-[0.938rem] md:text-base leading-[1.9] text-white/80 max-w-xl mx-auto">
            先行導入企業様には、API・基幹連携の無償実装支援、優先サポート、共同プレスリリース発信機会をご提供します。
            <br />
            業界共通の検証インフラを、一緒に立ち上げてみませんか。
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <CTAButton
              variant="primary"
              href="/contact?role=insurer"
              trackLocation="for-insurers-pilot"
            >
              パイロット参加を申し込む
            </CTAButton>
            <CTAButton
              variant="outline"
              href="/resources"
              trackLocation="for-insurers-pilot"
            >
              技術ホワイトペーパー
            </CTAButton>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section bg="alt">
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="既存の損害サービスシステムを置き換える必要がありますか？"
            answer="いいえ、置き換える必要はありません。Ledra は施工側の事実を確実に届ける『証明インフラ』として位置づけており、API 連携または管理画面操作で既存業務に組み込んでいただけます。"
          />
          <FAQItem
            question="本当に改ざんを検知できるのですか？"
            answer="はい、Polygon ブロックチェーンに証明書ハッシュを刻印することで、第三者検証可能な不整合検知を実現しています。Ledra のサーバに依存せず、独立に検証できる点が技術的なポイントです。詳細は技術ホワイトペーパーをご参照ください。"
          />
          <FAQItem
            question="施工店側にも何か必要ですか？"
            answer="施工店側が Ledra を利用していることが前提となります。Ledra は施工側・保険会社側双方のポータルを提供する両面プラットフォームのため、両者が乗ることで価値が立ち上がります。施工店への普及活動は当社で並行して進めています。"
          />
          <FAQItem
            question="セキュリティ要件・監査対応について資料はありますか？"
            answer={
              <>
                セキュリティホワイトペーパーをご用意しています。暗号化方式・鍵管理・RLS設計・監査ログ仕様を記載。
                <a href="/resources" className="text-blue-400 underline">
                  資料ダウンロードページ
                </a>
                よりご請求ください。
              </>
            }
          />
        </FAQList>
      </Section>

      <CTABanner
        title="検証可能な施工記録を、業界共通の基盤に。"
        subtitle="まずは概要資料をご覧いただき、必要であれば個別ご相談を。"
        primaryLabel="お問い合わせ"
        primaryHref="/contact?role=insurer"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
        tertiaryLabel="セキュリティを見る"
        tertiaryHref="/security"
        trackLocation="for-insurers-final"
      />
    </>
  );
}
