import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { CTAButton } from "@/components/marketing/CTAButton";

export const metadata = {
  title: "導入支援・サポート",
  description:
    "Ledra の導入支援・オンボーディング・トレーニング・SLA。立ち上げから運用定着までを、担当チームが伴走します。",
  alternates: { canonical: "/support" },
};

const onboardingSteps = [
  {
    step: "1",
    title: "キックオフ（1週目）",
    desc: "導入ゴール・KPI・既存業務フローの棚卸しを1時間のミーティングで共有。担当チームを正式アサインします。",
  },
  {
    step: "2",
    title: "データ移行（1〜2週目）",
    desc: "既存顧客・車両・施工履歴データのCSVインポート支援。フォーマット変換は担当側で代行可能です。",
  },
  {
    step: "3",
    title: "テナント初期設定（2週目）",
    desc: "メニュー・価格表・スタッフアカウント・ブランドロゴ・PDFテンプレートの設定を一緒に完了させます。",
  },
  {
    step: "4",
    title: "現場トレーニング（3週目）",
    desc: "証明書発行・車両登録・POS会計のワークフローを、店舗スタッフと一緒に実データで実演。録画教材もご提供。",
  },
  {
    step: "5",
    title: "ローンチ・運用定着（4週目〜）",
    desc: "本番稼働後2週間は専任サポート窓口を設置し、現場からの質問に即時回答。定着まで伴走します。",
  },
];

const supportOfferings = [
  {
    title: "導入支援（Implementation）",
    description:
      "データ移行・初期設定・現場トレーニングを、4〜6週間の標準プログラムで。基幹システムとの連携が必要な場合は別途ご相談を。",
  },
  {
    title: "オンボーディング教材",
    description:
      "ロール別チュートリアル動画・操作マニュアルPDF・FAQ を提供。新入スタッフの教育も自走できる形に。",
  },
  {
    title: "定期ヘルスチェック",
    description:
      "四半期ごとに利用状況・KPIの振り返りを実施。未使用機能の活用提案・運用改善のご提案をお送りします。",
  },
  {
    title: "優先サポート窓口",
    description:
      "Pro / Enterprise プランには専用Slackまたはメール窓口を開設。担当者が直接対応します。",
  },
  {
    title: "カスタム開発・API連携",
    description:
      "自社基幹システム・CRMとの連携、独自機能の追加をオプションで。要件定義から実装までワンストップで対応可能。",
  },
  {
    title: "知識共有コミュニティ",
    description:
      "導入企業限定のオンラインコミュニティ。運用ノウハウ・事例の共有、プロダクトロードマップのプレビュー。",
  },
];

const slaTable: { plan: string; response: string; hours: string; channel: string }[] = [
  {
    plan: "Starter",
    response: "2営業日以内",
    hours: "平日 10:00–18:00",
    channel: "メール",
  },
  {
    plan: "Standard",
    response: "1営業日以内",
    hours: "平日 9:00–19:00",
    channel: "メール / チャット",
  },
  {
    plan: "Pro",
    response: "4営業時間以内",
    hours: "平日 9:00–20:00",
    channel: "メール / チャット / 電話",
  },
  {
    plan: "Enterprise",
    response: "2営業時間以内",
    hours: "平日 8:00–22:00・休日一部対応",
    channel: "専用Slack / 電話 / 担当CSM",
  },
];

export default function SupportPage() {
  return (
    <>
      <PageHero
        badge="SUPPORT"
        title="導入から定着まで、担当チームが伴走します。"
        subtitle="Ledra は『入れて終わり』ではありません。データ移行、初期設定、現場教育、本番運用の定着まで、担当チームと一緒に進めます。"
      />

      {/* Onboarding timeline */}
      <Section>
        <SectionHeading
          title="4〜6週間のオンボーディングプログラム"
          subtitle="標準スケジュール。業務規模・既存システム連携の有無により調整いたします。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {onboardingSteps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">
                    {s.title}
                  </h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white/80">
                    {s.desc}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Support offerings */}
      <Section bg="alt">
        <SectionHeading
          title="提供するサポート"
          subtitle="プランに応じて、必要な支援を必要な深さで。"
        />
        <FeatureGrid className="mt-10">
          {supportOfferings.map((item, i) => (
            <FeatureCard
              key={item.title}
              title={item.title}
              description={item.description}
              delay={i * 50}
            />
          ))}
        </FeatureGrid>
      </Section>

      {/* SLA table */}
      <Section>
        <SectionHeading
          title="SLA・応答時間"
          subtitle="プランごとの標準応答時間。Enterprise では個別SLA契約を締結可能です。"
        />
        <div className="mx-auto mt-10 max-w-4xl overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/[0.08] bg-white/[0.02]">
              <tr>
                <th className="px-4 py-4 text-xs font-medium text-white/80 uppercase tracking-widest">
                  プラン
                </th>
                <th className="px-4 py-4 text-xs font-medium text-white/80 uppercase tracking-widest">
                  初回応答
                </th>
                <th className="px-4 py-4 text-xs font-medium text-white/80 uppercase tracking-widest">
                  対応時間
                </th>
                <th className="px-4 py-4 text-xs font-medium text-white/80 uppercase tracking-widest">
                  チャネル
                </th>
              </tr>
            </thead>
            <tbody>
              {slaTable.map((row, idx) => (
                <tr
                  key={row.plan}
                  className={idx > 0 ? "border-t border-white/[0.04]" : ""}
                >
                  <td className="px-4 py-5 font-semibold text-white">{row.plan}</td>
                  <td className="px-4 py-5 text-white/70">{row.response}</td>
                  <td className="px-4 py-5 text-white/70">{row.hours}</td>
                  <td className="px-4 py-5 text-white/70">{row.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-center text-xs text-white/75">
          緊急度（Critical / High / Normal）の定義は、別紙サポート規約にてご確認ください。
        </p>
      </Section>

      {/* Pilot CTA */}
      <Section bg="alt">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
            PILOT PROGRAM
          </div>
          <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">
            パイロット参加企業を募集しています
          </h2>
          <p className="mt-4 text-white/80 leading-relaxed">
            先行導入いただく施工店・保険会社・代理店には、導入支援の手厚い優遇、
            <br className="hidden md:block" />
            機能リクエストの優先反映、ロゴ掲載や事例化を通じた露出機会をご用意しています。
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <CTAButton variant="primary" href="/contact" trackLocation="support-pilot">
              パイロット参加を申し込む
            </CTAButton>
            <CTAButton variant="outline" href="/faq" trackLocation="support-pilot">
              よくある質問を見る
            </CTAButton>
          </div>
        </div>
      </Section>

      <CTABanner
        title="まずは一度、相談からでも。"
        subtitle="業務規模・既存システム・ご予算に応じて、最適な導入プランをご提案します。"
        primaryLabel="無料相談を申し込む"
        primaryHref="/contact"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
      />
    </>
  );
}
