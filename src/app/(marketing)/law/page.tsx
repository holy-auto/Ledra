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

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4 border-b border-white/[0.08] py-3 text-sm last:border-0">
      <dt className="font-medium text-white/80">{label}</dt>
      <dd className="text-white/80">{value}</dd>
    </div>
  );
}

export default function LawPage() {
  return (
    <Article>
      <h1 className="mb-2 text-3xl font-bold text-white">特定商取引法に基づく表記</h1>
      <p className="mb-10 text-sm text-white/75">特定商取引に関する法律第11条に基づき、以下のとおり表記します。</p>

      <dl className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-6">
        <Row label="販売事業者名" value="株式会社HOLY" />
        <Row label="代表者氏名" value="代表取締役　堀越　友輔" />
        <Row label="所在地" value="〒107-0061　東京都港区北青山1-3-1　アールキューブ青山3F" />
        <Row
          label="電話番号"
          value="開示請求に応じて速やかに提供します。まずは下記メールアドレスよりお問い合わせください。"
        />
        <Row
          label="メールアドレス"
          value={
            <a href={`mailto:${siteConfig.contactEmail}`} className="font-medium text-blue-400 hover:underline">
              {siteConfig.contactEmail}
            </a>
          }
        />
        <Row label="サービス名" value="Ledra（施工証明プラットフォーム）" />
        <Row label="販売価格" value="各プランの料金は料金ページをご参照ください。表示価格はすべて税込です。" />
        <Row
          label="支払方法"
          value="クレジットカード（Visa / Mastercard / JCB / American Express）。プロプランでは請求書払いも対応（別途お問い合わせください）。"
        />
        <Row label="支払時期" value="月額プランは毎月の契約更新日に自動決済されます。" />
        <Row label="サービス提供時期" value="お申し込み・決済完了後、直ちにご利用いただけます。" />
        <Row
          label="キャンセル・解約"
          value="マイページからいつでも解約できます。解約後は当月末日までサービスをご利用いただけます。月の途中での解約による日割り返金は行いません。"
        />
        <Row
          label="返品・返金"
          value="デジタルサービスの性質上、原則として返金はお受けしておりません。ただし当社の責に帰する事由によりサービスを提供できなかった場合はこの限りではありません。"
        />
        <Row
          label="動作環境"
          value="最新バージョンのChrome / Safari / Firefox / Edge（PC・スマートフォン）でご利用いただけます。"
        />
      </dl>

      <H2>お問い合わせ</H2>
      <p className="text-sm text-white/80">
        本表記に関するお問い合わせは{" "}
        <a href={`mailto:${siteConfig.contactEmail}`} className="font-medium text-blue-400 hover:underline">
          {siteConfig.contactEmail}
        </a>{" "}
        までご連絡ください。
      </p>
    </Article>
  );
}

export const metadata: Metadata = {
  title: `特定商取引法に基づく表記 | ${siteConfig.siteName}`,
  description: "Ledraの特定商取引法に基づく表記です。",
  openGraph: {
    title: `特定商取引法に基づく表記 | ${siteConfig.siteName}`,
    description: "Ledraの特定商取引法に基づく表記です。",
    url: `${siteConfig.siteUrl}/law`,
  },
  robots: { index: true, follow: false },
};
