import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ResourceCard, type Resource } from "@/components/marketing/ResourceCard";

export const metadata = {
  title: "資料ダウンロード",
  description: "Ledra のサービス概要・機能紹介・技術ホワイトペーパー・導入事例集を、まとめてダウンロードいただけます。",
  alternates: { canonical: "/resources" },
};

const resources: Resource[] = [
  {
    key: "service-overview",
    title: "サービス概要資料",
    description:
      "Ledra がどんな課題を解くサービスか、4ポータル設計、初期導入の流れをコンパクトにまとめた基本資料です。最初の1本としてお勧めします。",
    badge: "最初にお勧め",
    pageCount: 4,
    downloadUrl: "/api/marketing/resources/service-overview/pdf",
  },
  {
    key: "features-deep-dive",
    title: "機能紹介資料",
    description:
      "証明書発行・車両管理・POS・帳票・分析・連携など、全機能をカテゴリ別に詳説。Admin/Agent/Insurer/Customer の4ポータル構成も収録。",
    pageCount: 10,
    downloadUrl: "/api/marketing/resources/features-deep-dive/pdf",
  },
  {
    key: "security-whitepaper",
    title: "セキュリティホワイトペーパー",
    description:
      "暗号化方式・鍵管理・RLS設計・監査ログ仕様・Polygon anchoring の動作・データライフサイクルを、技術担当者・情報セキュリティ担当者向けにまとめた資料です。",
    badge: "技術者向け",
    pageCount: 10,
    downloadUrl: "/api/marketing/resources/security-whitepaper/pdf",
  },
  {
    key: "case-studies",
    title: "導入事例集",
    description:
      "先行導入いただいているパイロット企業様の導入背景・運用の変化・成果を業種別にまとめた事例集。現時点ではパイロット版として、計測フレームと業界別の変化パターンをまとめています。記事が公開されるたびに PDF にも順次反映します。",
    badge: "随時更新",
    pageCount: 9,
    downloadUrl: "/api/marketing/resources/case-studies/pdf",
  },
  {
    key: "roi-template",
    title: "ROIシミュレーション計算テンプレート",
    description:
      "月間発行数・紙管理に要する時間・書類再発行頻度から、年間の削減効果を算出する記入テンプレート。計算式・代表スケール参考値・感度分析まで収録。",
    pageCount: 7,
    downloadUrl: "/api/marketing/resources/roi-template/pdf",
  },
  {
    key: "pricing-overview",
    title: "料金プラン詳細資料",
    description:
      "各プランに含まれる機能・対応件数・サポート範囲・オプション料金まで、見積提示に必要な情報をまとめた資料です。",
    pageCount: 5,
    downloadUrl: "/api/marketing/resources/pricing-overview/pdf",
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        badge="RESOURCES"
        title="資料ダウンロード"
        subtitle="サービス概要、機能紹介、セキュリティ仕様、導入事例集まで。ご関心に合わせて、まとめてお届けします。"
      />

      <Section>
        <SectionHeading
          title="ご用意している資料"
          subtitle="簡単なフォームのご記入後、メールでダウンロードリンクをお送りします。"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
          {resources.map((r, i) => (
            <ResourceCard key={r.key} resource={r} delay={i * 60} />
          ))}
        </div>
        <p className="mt-12 text-center text-xs text-white/40">
          ご入力いただいた情報は、資料送付およびご案内のみに使用いたします。 詳しくは{" "}
          <a href="/privacy" className="underline hover:text-white/60">
            プライバシーポリシー
          </a>
          をご覧ください。
        </p>
      </Section>

      <CTABanner
        title="個別のご質問は、お気軽にどうぞ。"
        subtitle="業務規模・既存システム連携・ご予算に応じた個別のご提案も可能です。"
        primaryLabel="お問い合わせ"
        primaryHref="/contact"
        secondaryLabel="導入支援を見る"
        secondaryHref="/support"
      />
    </>
  );
}
