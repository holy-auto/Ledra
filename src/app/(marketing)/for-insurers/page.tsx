import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { StepList } from "@/components/marketing/StepList";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "保険会社の方へ",
  description: "CARTRUSTで施工証明書の確認・査定業務を効率化。データの信頼性向上と業務コスト削減を実現します。",
};

export default function ForInsurersPage() {
  return (
    <>
      <PageHero
        badge="FOR INSURERS"
        title="施工証明の確認に、何日かかっていますか？"
        subtitle="CARTRUSTなら、施工証明書のデジタル化により確認作業を即時化。査定精度の向上と業務コスト削減を同時に実現します。"
      />

      {/* Before / After */}
      <Section>
        <SectionHeading
          title="業務フローの変化"
          subtitle="CARTRUSの導入前後で、施工証明の確認作業がどう変わるか"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          <ScrollReveal variant="fade-up" delay={0}>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 h-full">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
                <span className="text-xs font-medium text-red-400">BEFORE</span>
              </div>
              <ul className="space-y-4">
                {[
                  "施工店に電話またはFAXで確認依頼",
                  "書類の返送を待つ（1〜3営業日）",
                  "紙の証明書を目視で確認",
                  "手動でシステムに転記",
                  "書類を保管・ファイリング",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/65">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400/60" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={150}>
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-8 h-full">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 mb-6">
                <span className="text-xs font-medium text-violet-400">AFTER</span>
              </div>
              <ul className="space-y-4">
                {[
                  "URLから施工証明書に即時アクセス",
                  "デジタルデータで改ざんの心配なし",
                  "必要な情報を検索・フィルタで取得",
                  "CSVで既存システムにインポート",
                  "クラウドで自動保管・いつでも閲覧可能",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-white/70">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-violet-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </ScrollReveal>
        </div>
      </Section>

      {/* セキュリティセクション */}
      <Section bg="alt">
        <SectionHeading
          title="企業レベルのセキュリティ"
          subtitle="保険会社の情報セキュリティ要件に対応しています"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 max-w-4xl mx-auto">
          {[
            {
              title: "SSL/TLS暗号化",
              description: "すべての通信はSSL/TLS暗号化で保護。データの盗聴・改ざんを防止します。",
              icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
            },
            {
              title: "改ざん防止",
              description: "発行された証明書は改ざんできない仕組みで管理。データの真正性を保証します。",
              icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
            },
            {
              title: "アクセスログ・監査ログ",
              description: "誰がいつどの証明書にアクセスしたかを記録。コンプライアンス要件に対応します。",
              icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
            },
            {
              title: "ロールベースアクセス制御",
              description: "閲覧権限を細かく設定可能。必要な担当者のみがデータにアクセスできます。",
              icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
            },
          ].map((item, i) => (
            <ScrollReveal key={item.title} variant="fade-up" delay={i * 100}>
              <div className="flex gap-5 p-6 rounded-xl bg-white/[0.04] border border-white/[0.08] h-full">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-500/15 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-violet-400">
                    <path d={item.icon} />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{item.title}</h3>
                  <p className="mt-1.5 text-xs text-white/65 leading-relaxed">{item.description}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* 保険会社向け機能 */}
      <Section>
        <SectionHeading
          title="保険会社向け機能"
          subtitle="査定業務に必要な機能を網羅しています"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          <FeatureCard
            variant="bordered"
            delay={0}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            title="施工内容の即時確認"
            description="URLひとつで施工証明書にアクセス。電話やFAXを待つことなく、必要な情報をすぐに確認できます。"
          />
          <FeatureCard
            variant="bordered"
            delay={100}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            }
            title="一括エクスポート"
            description="複数の証明書データをCSV形式で一括エクスポート。既存の社内システムとの連携もスムーズです。"
          />
          <FeatureCard
            variant="bordered"
            delay={200}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            }
            title="高度な検索・フィルタ"
            description="車両情報、施工日、施工店名など、多様な条件で証明書を検索。必要な情報に素早くアクセスできます。"
          />
          <FeatureCard
            variant="bordered"
            delay={300}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            }
            title="API連携"
            description="RESTful APIによるデータ連携が可能。保険会社の既存ワークフローに組み込めます。"
          />
        </div>
      </Section>

      {/* 導入プロセス */}
      <Section bg="alt">
        <SectionHeading
          title="導入プロセス"
          subtitle="専任担当がスムーズな導入をサポートします"
        />
        <StepList
          accent="violet"
          steps={[
            { step: "01", title: "お問い合わせ・ヒアリング", description: "貴社の業務フローや要件をヒアリングし、最適な導入プランをご提案します。" },
            { step: "02", title: "デモ・トライアル", description: "実際のシステムをデモ環境でお試しいただけます。貴社のデータでのテストも可能です。" },
            { step: "03", title: "導入設定・連携テスト", description: "貴社のシステムとの連携設定、アクセス権限の設定、テストデータでの動作確認を行います。" },
            { step: "04", title: "本番運用開始", description: "運用開始後も専任担当がサポート。利用状況に応じた改善提案も行います。" },
          ]}
        />
      </Section>

      <CTABanner
        title="まずはデモをご覧ください"
        subtitle="導入のご相談・デモのご依頼は、お気軽にお問い合わせください。"
        primaryLabel="デモを依頼"
        primaryHref="/contact"
        secondaryLabel="資料請求"
        secondaryHref="/contact"
      />
    </>
  );
}
