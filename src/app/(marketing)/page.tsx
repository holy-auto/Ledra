import type { ReactNode } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/config";

// ─── ユーティリティ: セクション共通ラッパー ────────────────────────────────

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

// ─── セクション: Hero ─────────────────────────────────────────────────────

function HeroSection() {
  return (
    <Section className="bg-white pb-20 pt-28 text-center">
      <div className="mx-auto max-w-3xl">
        <span className="inline-block rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs font-medium tracking-wide text-zinc-500">
          施工店・保険会社向けSaaS
        </span>

        <h1 className="mt-6 text-4xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          施工証明を、
          <br />
          もっとスマートに。
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-500">
          CARTRUSTは施工店のデジタル証明書発行と、
          保険会社の迅速な確認・管理を
          ひとつのプラットフォームで解決します。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="rounded-full bg-zinc-900 px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            無料で試してみる
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-zinc-200 bg-white px-7 py-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            料金を見る
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── セクション: 価値提案 ──────────────────────────────────────────────────

const valueProps = [
  {
    icon: "🏪",
    title: "施工店",
    headline: "紙の証明書を、ゼロに。",
    body: "施工実績をデジタルで記録・管理・共有。QRコードひとつで証明書を発行でき、顧客への信頼と業務効率を同時に高めます。",
    href: "/for-shops",
    cta: "施工店の方へ",
  },
  {
    icon: "🏢",
    title: "保険会社",
    headline: "施工証明を、リアルタイムで。",
    body: "代理店・保険会社がWebで即時確認。改ざんのない施工記録がいつでも参照でき、査定・保全業務を大幅に効率化します。",
    href: "/for-insurers",
    cta: "保険会社の方へ",
  },
  {
    icon: "🔒",
    title: "信頼性",
    headline: "双方に、確かなエビデンスを。",
    body: "施工履歴は改ざん不可の形で保存されます。施工店と保険会社の間に立つ、中立的な証明プラットフォームです。",
    href: "/contact",
    cta: "お問い合わせ",
  },
];

function ValueSection() {
  return (
    <Section className="bg-zinc-50">
      <div className="mb-14 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          なぜCARTRUSTが選ばれるのか
        </h2>
        <p className="mt-4 text-zinc-500">
          施工店と保険会社、両者の課題をひとつで解決します。
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {valueProps.map((item) => (
          <div
            key={item.title}
            className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
          >
            <span className="text-2xl" aria-hidden="true">{item.icon}</span>
            <span className="mt-4 text-xs font-semibold uppercase tracking-widest text-zinc-400">
              {item.title}
            </span>
            <h3 className="mt-2 text-lg font-semibold text-zinc-900">
              {item.headline}
            </h3>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-500">
              {item.body}
            </p>
            <Link
              href={item.href}
              className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:underline"
            >
              {item.cta}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── セクション: ターゲット別 ──────────────────────────────────────────────

function TargetSection() {
  return (
    <Section className="bg-white">
      <div className="grid gap-8 md:grid-cols-2">
        {/* 施工店カード */}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            For 施工店
          </span>
          <h2 className="mt-3 text-2xl font-bold text-zinc-900">
            施工実績の証明を、
            <br />
            もっと簡単に。
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {[
              "スマートフォンから証明書を即発行",
              "QRコードで顧客・保険会社へ共有",
              "施工履歴を一元管理・検索",
              "保険適用時の査定をスムーズに",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="mt-0.5 text-zinc-400" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/for-shops"
            className="mt-8 inline-flex items-center gap-1 rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            施工店向け詳細
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        {/* 保険会社カード */}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-10">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            For 保険会社
          </span>
          <h2 className="mt-3 text-2xl font-bold text-zinc-900">
            施工証明の確認を、
            <br />
            リアルタイムで。
          </h2>
          <ul className="mt-6 flex flex-col gap-3">
            {[
              "Webブラウザで証明書を即時確認",
              "改ざん不可の施工記録を参照",
              "複数施工店の証明書を一括管理",
              "代理店・担当者ごとのアクセス管理",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-zinc-600">
                <span className="mt-0.5 text-zinc-400" aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <Link
            href="/for-insurers"
            className="mt-8 inline-flex items-center gap-1 rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            保険会社向け詳細
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── セクション: 使い方ステップ ───────────────────────────────────────────

const steps = [
  {
    step: "01",
    title: "施工店が証明書を発行",
    body: "施工完了後、管理画面から車両情報・施工内容を入力して証明書を発行。数分で完了します。",
  },
  {
    step: "02",
    title: "QRコード・URLで共有",
    body: "発行された証明書のQRコードやURLを、顧客・保険会社へ送付。アプリ不要で確認できます。",
  },
  {
    step: "03",
    title: "保険会社がリアルタイム確認",
    body: "保険会社はポータルから証明書を即時確認。改ざんのない施工記録をもとに迅速な判断が可能です。",
  },
];

function HowItWorksSection() {
  return (
    <Section className="bg-zinc-50">
      <div className="mb-14 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          3ステップで完結
        </h2>
        <p className="mt-4 text-zinc-500">
          導入から利用まで、複雑な手続きは不要です。
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {steps.map((item) => (
          <div key={item.step} className="rounded-2xl bg-white p-8 shadow-sm">
            <span className="text-4xl font-bold text-zinc-100">{item.step}</span>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">
              {item.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── セクション: 最終CTA ──────────────────────────────────────────────────

function CtaSection() {
  return (
    <Section className="bg-zinc-900">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          まずは無料でお試しください
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-zinc-400">
          初期費用不要。導入サポート付き。
          施工店・保険会社の担当者様からのお問い合わせをお待ちしています。
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="rounded-full bg-white px-7 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            お問い合わせ・資料請求
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            料金プランを確認する
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ValueSection />
      <TargetSection />
      <HowItWorksSection />
      <CtaSection />
    </>
  );
}

export const metadata = {
  title: `${siteConfig.siteName} — 施工証明をデジタルで`,
  description: siteConfig.siteDescription,
};
