import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/marketing/config";

function Article({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <article className="prose prose-invert max-w-none">{children}</article>
    </div>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-10 text-lg font-bold text-white">{children}</h2>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-sm leading-relaxed text-white">{children}</p>;
}

function Policy({ term, children }: { term: string; children: ReactNode }) {
  return (
    <li className="leading-relaxed">
      <span className="font-bold text-white">{term}</span>
      <span className="mx-1">—</span>
      {children}
    </li>
  );
}

export default function SecurityPolicyPage() {
  const established = "2026年4月1日";

  return (
    <Article>
      <h1 className="mb-2 text-3xl font-bold text-white">情報セキュリティ基本方針</h1>
      <p className="mb-10 text-sm text-white">制定日：{established}</p>

      <P>
        株式会社HOLY（以下「当社」）は、自動車のコーティング・PPF・カスタム・電装の施工事業、ならびに施工証明・車両履歴管理プラットフォーム「
        {siteConfig.siteName}
        」の開発・運営にあたり、お客様および車両に関する情報を適切に取り扱うことを経営上の重要な責務と位置づけます。当社は、これらの情報資産を脅威から保護するため、以下のとおり情報セキュリティ基本方針を定め、組織全体で取り組みます。
      </P>

      <H2>1. 目的</H2>
      <P>
        本方針は、当社が取り扱う情報資産の機密性・完全性・可用性を維持し、お客様・取引先・関係者からの信頼に応えることを目的とします。
      </P>

      <H2>2. 適用範囲</H2>
      <P>
        本方針は、当社の役員および従業員、ならびに業務を委託する事業者に適用し、当社が取り扱うすべての情報資産を対象とします。
      </P>

      <H2>3. 取り組み方針</H2>
      <P>当社は、情報セキュリティの確保のため、以下に取り組みます。</P>
      <ol className="mb-4 list-decimal space-y-3 pl-5 text-sm text-white">
        <Policy term="管理体制の整備">情報セキュリティに関する責任者を定め、組織的に対策を推進します。</Policy>
        <Policy term="法令・規範の遵守">
          情報セキュリティに関する法令、国が示すガイドライン、契約上の要求事項を遵守します。
        </Policy>
        <Policy term="技術的対策の実施">
          不正アクセス・情報漏えい・改ざん・サービス停止等の脅威に対し、アクセス制御、データの分離、権限管理、通信の暗号化等の技術的対策を講じます。
        </Policy>
        <Policy term="情報資産の適切な管理">
          取り扱う情報をその重要度に応じて管理し、目的の範囲を超えた利用を行いません。
        </Policy>
        <Policy term="教育と意識向上">役員・従業員に対し、情報セキュリティに関する周知と意識向上を図ります。</Policy>
        <Policy term="事故への備えと対応">
          万一情報セキュリティ上の問題が発生した場合に備え、速やかに対応し、被害の最小化と再発防止に努めます。
        </Policy>
        <Policy term="継続的な改善">
          自社の対策状況を定期的に点検し、本方針および対策を継続的に見直し、改善します。
        </Policy>
      </ol>

      <H2>4. 制定</H2>
      <P>本方針は、株式会社HOLY 代表取締役 堀越 友輔が定め、対外的に表明するものです。</P>
      <div className="mb-4 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-6 py-5 text-sm leading-relaxed text-white">
        制定日：{established}
        <br />
        株式会社HOLY
        <br />
        代表取締役　堀越 友輔
        <br />
        〒107-0061　東京都港区北青山1-3-1　アールキューブ青山3F
      </div>

      <H2>お問い合わせ</H2>
      <P>
        本方針に関するお問い合わせは{" "}
        <a href={`mailto:${siteConfig.contactEmail}`} className="font-medium text-blue-400 hover:underline">
          {siteConfig.contactEmail}
        </a>{" "}
        までご連絡ください。
      </P>
    </Article>
  );
}

export const metadata: Metadata = {
  title: `情報セキュリティ基本方針 | ${siteConfig.siteName}`,
  description: "株式会社HOLY（Ledra）の情報セキュリティ基本方針です。",
  alternates: { canonical: "/security-policy" },
  openGraph: {
    title: `情報セキュリティ基本方針 | ${siteConfig.siteName}`,
    description: "株式会社HOLY（Ledra）の情報セキュリティ基本方針です。",
    url: `${siteConfig.siteUrl}/security-policy`,
  },
  robots: { index: true, follow: false },
};
