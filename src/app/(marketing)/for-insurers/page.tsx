import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "保険会社の方へ",
  description: "Ledraで施工証明書の真正性を即座に確認。査定業務を効率化し、不正請求のリスクを低減。",
};

export default function ForInsurersPage() {
  return (
    <>
      {/* Hero */}
      <Section bg="white">
        <SectionHeading
          title="施工証明の確認を、一瞬で"
          subtitle="保険金請求時の施工証明書の真正性確認を、数秒で完了。査定業務の効率化と不正請求リスクの低減を同時に実現します。"
        />
      </Section>

      {/* Pain points */}
      <Section bg="alt">
        <SectionHeading title="こんな課題を解決します" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 md:grid-cols-2">
            {[
              {
                title: "証明書の真贋確認に時間がかかる",
                desc: "紙やPDFの証明書をいちいち施工店に電話確認。Ledraなら検索1回で真正性を即時確認。",
              },
              {
                title: "施工内容の詳細が不明確",
                desc: "何をどこまで施工したのか不明な請求書。Ledraの証明書は写真・施工内容・施工店情報を一元管理。",
              },
              {
                title: "不正請求のリスク",
                desc: "偽造証明書や水増し請求の判別が困難。Ledraの証明書はプラットフォーム認証付きで改ざん不可。",
              },
              {
                title: "査定担当者間の情報共有",
                desc: "案件の進捗が属人化。Ledraの案件管理で対応状況をチーム全体で把握。",
              },
            ].map((item) => (
              <div key={item.title} className="glass-card p-5">
                <h3 className="font-semibold text-primary">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* Features */}
      <Section bg="white">
        <SectionHeading title="保険会社ポータルの機能" />
        <FeatureGrid className="mt-10">
          <FeatureCard
            title="証明書検索"
            description="Public ID・顧客名・車両情報・ナンバーで証明書を即座に検索。ステータスや日付での絞り込みも。"
          />
          <FeatureCard
            title="案件管理"
            description="問い合わせから査定完了までを案件として管理。メッセージ・添付ファイル・テンプレートで効率化。"
          />
          <FeatureCard
            title="自動振り分け"
            description="ルールベースで案件を担当者に自動割り振り。SLA管理で対応漏れを防止。"
          />
          <FeatureCard
            title="分析レポート"
            description="検索パターン分析、案件処理統計、施工店別統計で業務を可視化。"
          />
          <FeatureCard
            title="ウォッチリスト"
            description="気になる証明書をウォッチリストに追加。ステータス変更時に自動通知。"
          />
          <FeatureCard
            title="監査ログ"
            description="誰がいつ何を閲覧・操作したかを完全記録。コンプライアンス対応も万全。"
          />
        </FeatureGrid>
      </Section>

      {/* Onboarding */}
      <Section bg="alt">
        <SectionHeading title="導入の流れ" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-2xl space-y-6">
            {[
              {
                step: "1",
                title: "オンライン申込",
                desc: "法人番号を入力して企業情報を自動取得。メール認証で本人確認。",
              },
              { step: "2", title: "プラン選択", desc: "Basic/Pro/Enterpriseの3プランから選択。無料トライアルも可能。" },
              { step: "3", title: "チーム招待", desc: "査定担当者をCSV一括またはメールで招待。ロール設定も柔軟に。" },
              {
                step: "4",
                title: "運用開始",
                desc: "証明書検索と案件管理をすぐに開始。オンボーディングウィザードがガイドします。",
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

      <CTABanner />
    </>
  );
}
