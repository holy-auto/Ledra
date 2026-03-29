import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "代理店の方へ",
  description: "Ledraパートナープログラムのご案内。施工店を紹介してコミッションを獲得。",
};

export default function ForAgentsPage() {
  return (
    <>
      {/* Hero */}
      <Section bg="white">
        <SectionHeading
          title="紹介するだけで、継続コミッション"
          subtitle="Ledraパートナープログラムに参加して、施工店を紹介。契約成立でコミッションが発生し、利用継続中は継続報酬を受け取れます。"
        />
      </Section>

      {/* How it works */}
      <Section bg="alt">
        <SectionHeading title="パートナープログラムの仕組み" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-2xl space-y-6">
            {[
              {
                step: "1",
                title: "パートナー申請",
                desc: "オンラインフォームから申請。審査完了後、専用ダッシュボードが利用可能に。",
              },
              {
                step: "2",
                title: "施工店を紹介",
                desc: "紹介リンクを発行し、施工店にLedraを案内。営業資料や研修コンテンツも提供。",
              },
              {
                step: "3",
                title: "契約成立",
                desc: "紹介先の施工店がLedraに登録・有料プランを契約するとコミッションが確定。",
              },
              {
                step: "4",
                title: "コミッション受取",
                desc: "Stripe Connect経由で毎月自動振込。ダッシュボードで実績をリアルタイムに確認。",
              },
            ].map((item) => (
              <div key={item.step} className="glass-card flex items-start gap-4 p-5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-primary">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* Features */}
      <Section bg="white">
        <SectionHeading title="パートナー向け機能" />
        <FeatureGrid className="mt-10">
          <FeatureCard
            title="専用ダッシュボード"
            description="紹介数、成約率、コミッション実績をリアルタイムに把握。"
          />
          <FeatureCard
            title="紹介リンク管理"
            description="トラッキングURL を生成し、どの紹介がどの成約につながったかを可視化。"
          />
          <FeatureCard title="営業資料" description="提案書・パンフレット・動画などの営業素材をダウンロード可能。" />
          <FeatureCard
            title="ランキング"
            description="パートナー間の実績ランキングで切磋琢磨。上位パートナーには特別報酬も。"
          />
          <FeatureCard title="研修コンテンツ" description="Ledraの機能や販売ノウハウを学べる研修プログラムを提供。" />
          <FeatureCard title="サポート体制" description="専用サポートチケットとFAQで、パートナー活動を支援。" />
        </FeatureGrid>
      </Section>

      <CTABanner />
    </>
  );
}
