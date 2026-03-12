import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/config";

// ─── データ ───────────────────────────────────────────────────────────────

type Plan = {
  name: string;
  price: string;
  priceNote: string;
  description: string;
  cta: string;
  ctaHref: string;
  highlight: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "フリー",
    price: "¥0",
    priceNote: "/ 月",
    description: "個人・小規模施工店の試用に",
    cta: "無料で始める",
    ctaHref: siteConfig.loginUrl,
    highlight: false,
    features: [
      "証明書発行 月10枚まで",
      "施工履歴の保管（90日間）",
      "QRコード共有",
      "1アカウント",
      "メールサポート",
    ],
  },
  {
    name: "スタンダード",
    price: "¥3,980",
    priceNote: "/ 月（税込）",
    description: "中規模施工店・継続利用に最適",
    cta: "14日間無料で試す",
    ctaHref: "/contact",
    highlight: true,
    features: [
      "証明書発行 月100枚まで",
      "施工履歴の無期限保管",
      "QRコード・URL共有",
      "スタッフアカウント 5名まで",
      "施工実績ダッシュボード",
      "優先メール・チャットサポート",
    ],
  },
  {
    name: "プロ",
    price: "¥9,800",
    priceNote: "/ 月（税込）",
    description: "大規模店舗・保険会社連携に",
    cta: "お問い合わせ",
    ctaHref: "/contact",
    highlight: false,
    features: [
      "証明書発行 無制限",
      "施工履歴の無期限保管",
      "QRコード・URL共有",
      "スタッフアカウント 無制限",
      "施工実績ダッシュボード",
      "保険会社向けAPI連携",
      "専任サポート担当",
      "SLA 99.9% 保証",
    ],
  },
];

// ─── コンポーネント ───────────────────────────────────────────────────────

function Section({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-6 py-24 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7.5" stroke="currentColor" strokeOpacity="0.3" />
      <path
        d="M4.5 8l2.5 2.5 4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl p-8 ${
        plan.highlight
          ? "bg-zinc-900 text-white shadow-xl"
          : "border border-zinc-200 bg-white"
      }`}
    >
      {plan.highlight && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-zinc-700 px-4 py-1 text-xs font-semibold text-zinc-200">
          おすすめ
        </span>
      )}

      <div>
        <p
          className={`text-sm font-semibold ${
            plan.highlight ? "text-zinc-300" : "text-zinc-500"
          }`}
        >
          {plan.name}
        </p>
        <div className="mt-2 flex items-end gap-1">
          <span className="text-3xl font-bold">{plan.price}</span>
          <span
            className={`mb-1 text-sm ${
              plan.highlight ? "text-zinc-400" : "text-zinc-400"
            }`}
          >
            {plan.priceNote}
          </span>
        </div>
        <p
          className={`mt-1 text-sm ${
            plan.highlight ? "text-zinc-400" : "text-zinc-500"
          }`}
        >
          {plan.description}
        </p>
      </div>

      <Link
        href={plan.ctaHref}
        className={`mt-6 rounded-full px-6 py-2.5 text-center text-sm font-medium transition-colors ${
          plan.highlight
            ? "bg-white text-zinc-900 hover:bg-zinc-100"
            : "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
        }`}
      >
        {plan.cta}
      </Link>

      <ul className="mt-8 flex flex-col gap-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <CheckIcon />
            <span
              className={`text-sm ${
                plan.highlight ? "text-zinc-300" : "text-zinc-600"
              }`}
            >
              {f}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── FAQセクション（簡易版） ──────────────────────────────────────────────

const faqs = [
  {
    q: "14日間の無料トライアル後はどうなりますか？",
    a: "トライアル期間終了後、自動的に有料プランへの移行はされません。継続を希望される場合はお申し込みをお願いします。",
  },
  {
    q: "途中でプランを変更できますか？",
    a: "はい、いつでもプランを変更できます。アップグレードは即日反映、ダウングレードは翌月から適用されます。",
  },
  {
    q: "支払い方法は何がありますか？",
    a: "クレジットカード（Visa / Mastercard / JCB / Amex）に対応しています。請求書払いはプロプラン以上でご相談ください。",
  },
  {
    q: "保険会社向けのAPIはどのプランで使えますか？",
    a: "プロプランでご利用いただけます。API仕様の詳細はお問い合わせください。",
  },
];

function FaqSection() {
  return (
    <Section className="bg-zinc-50">
      <div className="mx-auto max-w-2xl">
        <h2 className="mb-10 text-center text-2xl font-bold text-zinc-900">
          よくある質問
        </h2>

        <div className="flex flex-col divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          {faqs.map((item) => (
            <div key={item.q} className="p-6">
              <p className="text-sm font-semibold text-zinc-900">{item.q}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {item.a}
              </p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-zinc-400">
          その他のご質問は{" "}
          <Link href="/faq" className="font-medium text-zinc-700 hover:underline">
            FAQ
          </Link>{" "}
          または{" "}
          <Link
            href="/contact"
            className="font-medium text-zinc-700 hover:underline"
          >
            お問い合わせ
          </Link>{" "}
          ページへ。
        </p>
      </div>
    </Section>
  );
}

// ─── CTA ─────────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <Section className="bg-zinc-900">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">
          まずは無料で試してみてください
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-zinc-400">
          クレジットカード不要。登録当日から証明書を発行できます。
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={siteConfig.loginUrl}
            className="rounded-full bg-white px-7 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            無料で始める
          </Link>
          <Link
            href="/contact"
            className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            プランの相談をする
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────

export default function PricingPage() {
  return (
    <>
      {/* ヘッダー */}
      <section className="bg-white px-6 pb-20 pt-28 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Pricing
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            シンプルな料金設計
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-500">
            小規模店から大規模施工店・保険会社まで、規模に合わせてお選びいただけます。
          </p>
        </div>
      </section>

      {/* プランカード */}
      <section className="bg-zinc-50 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-zinc-400">
            ※ 表示価格はすべて税込です。法人向けのカスタムプランについてはお問い合わせください。
          </p>
        </div>
      </section>

      <FaqSection />
      <CtaSection />
    </>
  );
}

export const metadata: Metadata = {
  title: `料金 | ${siteConfig.siteName}`,
  description:
    "CARTRUSTの料金プラン。フリー・スタンダード・プロの3プランをご用意。小規模施工店から保険会社連携まで対応します。",
  openGraph: {
    title: `料金 | ${siteConfig.siteName}`,
    description:
      "CARTRUSTの料金プラン。フリー・スタンダード・プロの3プランをご用意。小規模施工店から保険会社連携まで対応します。",
    url: `${siteConfig.siteUrl}/pricing`,
  },
  twitter: {
    title: `料金 | ${siteConfig.siteName}`,
    description:
      "CARTRUSTの料金プラン。フリー・スタンダード・プロの3プランをご用意。小規模施工店から保険会社連携まで対応します。",
  },
};
