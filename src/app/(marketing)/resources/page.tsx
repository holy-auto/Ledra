import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ResourceCard, type Resource } from "@/components/marketing/ResourceCard";
import { RESOURCE_CATALOG } from "@/lib/marketing/resourceCatalog";
import { RESOURCE_BUNDLE_FILENAME, RESOURCE_BUNDLE_KEY } from "@/lib/marketing/resourceBundle";

export const metadata = {
  title: "資料ダウンロード",
  description:
    "Ledra のサービス概要・機能紹介・技術ホワイトペーパー・導入事例集・運用スタートガイド・業界用語集を、まとめてダウンロードいただけます。",
  alternates: { canonical: "/resources" },
};

const resources: readonly Resource[] = RESOURCE_CATALOG;

const bundleResource: Resource = {
  key: RESOURCE_BUNDLE_KEY,
  title: "全資料パック（まとめてダウンロード）",
  description:
    "サービス概要・機能紹介・セキュリティ・導入事例・ROI・料金プラン・運用ガイド・用語集の全資料をひとつの ZIP にまとめてお届けします。社内共有や検討資料の一括取得に。",
  badge: "一括",
  downloadUrl: "/api/marketing/resources/all/zip",
  downloadFilename: RESOURCE_BUNDLE_FILENAME,
  ctaLabel: "まとめてダウンロード",
};

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
        <div className="mt-10">
          <ResourceCard resource={bundleResource} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {resources.map((r, i) => (
            <ResourceCard key={r.key} resource={r} delay={i * 60} />
          ))}
        </div>
        <p className="mt-12 text-center text-xs text-white">
          ご入力いただいた情報は、資料送付およびご案内のみに使用いたします。 詳しくは{" "}
          <a href="/privacy" className="underline hover:text-white">
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
