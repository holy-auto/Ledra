import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "施工店の方へ",
  description: "Ledraで施工証明書の作成・管理を効率化。デジタル証明書で技術を正しく証明し、信頼を構築。",
};

export default function ForShopsPage() {
  return (
    <>
      {/* Hero */}
      <Section bg="white">
        <SectionHeading
          title="施工の技術を、証明に変える"
          subtitle="コーティング・フィルム・ラッピング。一件一件の施工を、QRコード付きデジタル証明書として発行・管理。保険会社への証明、顧客への安心を同時に実現します。"
        />
      </Section>

      {/* Features */}
      <Section bg="alt">
        <SectionHeading title="Ledraでできること" />
        <FeatureGrid className="mt-10">
          <FeatureCard
            title="デジタル施工証明書"
            description="写真・施工内容をまとめた証明書をワンクリック発行。QRコードで顧客に即共有。"
          />
          <FeatureCard
            title="車検証OCR"
            description="車検証をカメラで撮影するだけで車両情報を自動入力。手入力の手間を大幅削減。"
          />
          <FeatureCard
            title="予約・作業管理"
            description="予約受付からチェックイン、作業進捗、完了までを一元管理。Googleカレンダーとも連携。"
          />
          <FeatureCard
            title="POS会計"
            description="施工完了後のお会計をその場で。カード決済・現金・QR決済に対応。Square連携も可能。"
          />
          <FeatureCard
            title="請求書・帳票"
            description="請求書をPDFで自動生成。メール送信や共有リンクで顧客に送付。未回収アラートも。"
          />
          <FeatureCard
            title="経営分析"
            description="売上推移、顧客単価、リピート率、キャッシュフローを可視化。データに基づく経営判断を支援。"
          />
          <FeatureCard
            title="BtoB受発注"
            description="他の施工店と連携。得意分野を活かした仕事の受発注がプラットフォーム上で完結。"
          />
          <FeatureCard
            title="NFC対応"
            description="NFCタグに証明書を紐付け。スマホをかざすだけで施工証明を確認できるプレミアム体験。"
          />
        </FeatureGrid>
      </Section>

      {/* Workflow */}
      <Section bg="white">
        <SectionHeading title="導入の流れ" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-2xl space-y-6">
            {[
              { step: "1", title: "アカウント作成", desc: "メールアドレスで無料登録。最短1分で開始。" },
              { step: "2", title: "店舗情報を設定", desc: "店舗名・ロゴ・施工メニューを登録。" },
              { step: "3", title: "証明書を発行", desc: "施工完了後、写真と施工内容を入力して証明書を発行。" },
              { step: "4", title: "顧客に共有", desc: "QRコードやURLで顧客のスマホに証明書を届ける。" },
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
