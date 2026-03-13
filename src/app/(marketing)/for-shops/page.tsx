import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "施工店の方へ",
  description: "CARTRUSTで施工証明書の作成・管理を効率化。顧客満足度と保険会社との連携を同時に向上させます。",
};

export default function ForShopsPage() {
  return (
    <>
      <PageHero
        badge="FOR SHOPS"
        title="施工証明の業務を、劇的に効率化"
        subtitle="紙やExcelでの管理から脱却。デジタル証明書で業務品質と顧客満足度を同時に向上させます。"
      />

      {/* 主要メリット */}
      <Section>
        <SectionHeading
          title="CARTRUSTが施工店にもたらす価値"
          subtitle="証明書発行から管理まで、施工店の業務をワンストップで支援します"
        />
        <FeatureGrid>
          <FeatureCard
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
            title="証明書作成の時間を80%削減"
            description="テンプレートに沿って入力するだけ。手書きやExcelでの作成から解放され、1件あたりの作成時間を大幅に短縮します。"
          />
          <FeatureCard
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="顧客への信頼感を向上"
            description="デジタル証明書の発行により、施工品質の見える化を実現。顧客からの信頼獲得と、リピート率の向上につながります。"
          />
          <FeatureCard
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
            title="証明書の一元管理"
            description="過去の発行履歴をすべてクラウドで管理。検索・再発行・エクスポートがいつでも可能です。"
          />
        </FeatureGrid>
      </Section>

      {/* ワークフロー */}
      <Section bg="alt">
        <SectionHeading
          title="かんたん3ステップ"
          subtitle="面倒な手続きは不要。すぐに使い始められます"
        />
        <div className="max-w-3xl mx-auto">
          {[
            {
              step: "01",
              title: "施工内容を入力",
              description: "テンプレートに沿って、車両情報・施工内容・使用材料を入力します。写真のアップロードも可能です。",
            },
            {
              step: "02",
              title: "証明書を発行",
              description: "入力内容を確認して発行ボタンを押すだけ。改ざん防止のデジタル証明書が即座に生成されます。",
            },
            {
              step: "03",
              title: "URLで共有",
              description: "発行された証明書のURLを顧客や保険会社に共有。QRコードでの共有にも対応しています。",
            },
          ].map((item, i) => (
            <ScrollReveal key={item.step} variant="fade-up" delay={i * 120}>
              <div className="flex gap-6 md:gap-8 items-start py-8 border-b border-border last:border-b-0">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary/[0.08] flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">{item.step}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-heading">{item.title}</h3>
                  <p className="mt-2 text-body leading-relaxed">{item.description}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* 追加メリット */}
      <Section>
        <SectionHeading
          title="さらに、こんなメリットも"
          subtitle="施工店の日々の業務を支える機能が揃っています"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            title="保険会社との連携強化"
            description="保険会社が直接証明書を確認できるため、問い合わせ対応が不要に。スムーズな連携で双方の業務負荷を軽減します。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            }
            title="スマートフォン対応"
            description="スマートフォンからも証明書の作成・管理が可能。現場でそのまま入力できるため、二度手間を防ぎます。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            }
            title="ブランドカスタマイズ"
            description="自社のロゴやカラーを証明書に反映。プロフェッショナルな印象を顧客に与えることができます。"
          />
          <FeatureCard
            variant="bordered"
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            title="データ分析・レポート"
            description="発行件数や施工内容の傾向をダッシュボードで確認。経営判断に活かせるインサイトを提供します。"
          />
        </div>
      </Section>

      <CTABanner
        title="施工証明書の管理を、今日から効率化"
        subtitle="無料プランで今すぐ始められます。クレジットカード不要。"
        primaryLabel="無料で始める"
        secondaryLabel="資料請求"
      />
    </>
  );
}
