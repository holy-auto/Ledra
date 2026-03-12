import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/config";

// ─── ユーティリティ ───────────────────────────────────────────────────────

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

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mb-14 text-center">
      {eyebrow && (
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
        {title}
      </h2>
      {body && (
        <p className="mx-auto mt-4 max-w-xl text-zinc-500">{body}</p>
      )}
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <Section className="bg-white pb-20 pt-28 text-center">
      <div className="mx-auto max-w-3xl">
        <span className="inline-block rounded-full border border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs font-medium tracking-wide text-zinc-500">
          施工店の方へ
        </span>

        <h1 className="mt-6 text-4xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          施工証明書の発行、
          <br />
          もっと楽にできます。
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-500">
          紙の証明書・手書き記録・保険会社への何度もの確認連絡——
          CARTRUSTは施工店が抱える証明業務のすべてをデジタル化します。
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

// ─── 課題 → 解決（Before / After） ───────────────────────────────────────

const painPoints = [
  {
    before: "証明書を紙で作って印刷・郵送している",
    after: "スマートフォンから数分で電子証明書を発行",
  },
  {
    before: "保険会社から何度も確認の電話やメールが来る",
    after: "保険会社がWebで直接確認——連絡不要",
  },
  {
    before: "過去の施工記録を探すのに時間がかかる",
    after: "クラウドで一元管理、キーワードで即検索",
  },
  {
    before: "証明書の真正性を問われてトラブルになる",
    after: "改ざん不可の電子証明で信頼性を担保",
  },
];

function PainPointSection() {
  return (
    <Section className="bg-zinc-50">
      <SectionHeading
        eyebrow="Before / After"
        title="こんなお悩み、ありませんか？"
        body="CARTRUST導入前後の変化です。"
      />

      <div className="flex flex-col gap-4">
        {painPoints.map((item, i) => (
          <div
            key={i}
            className="grid gap-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:grid-cols-2"
          >
            {/* Before */}
            <div className="flex items-start gap-3 border-b border-zinc-100 p-6 sm:border-b-0 sm:border-r">
              <span className="mt-0.5 flex-shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-400">
                Before
              </span>
              <p className="text-sm text-zinc-600">{item.before}</p>
            </div>
            {/* After */}
            <div className="flex items-start gap-3 bg-zinc-50 p-6">
              <span className="mt-0.5 flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                After
              </span>
              <p className="text-sm font-medium text-zinc-800">{item.after}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── 機能一覧 ─────────────────────────────────────────────────────────────

const features = [
  {
    icon: "📱",
    title: "スマホから証明書を即発行",
    body: "車両情報と施工内容を入力するだけ。専用アプリ不要、ブラウザから操作できます。",
  },
  {
    icon: "🔗",
    title: "QRコード・URLで即時共有",
    body: "発行した証明書のQRコードを印刷、またはURLを送付。相手はアプリなしで確認できます。",
  },
  {
    icon: "📂",
    title: "施工履歴の一元管理",
    body: "車両番号・施工日・施工内容で絞り込み検索。いつでもどこからでも参照できます。",
  },
  {
    icon: "🔒",
    title: "改ざん不可の電子証明",
    body: "発行後の証明書は変更できない仕組みで保存。保険会社・顧客からの信頼を高めます。",
  },
  {
    icon: "👥",
    title: "スタッフ複数人で利用可能",
    body: "アカウントをスタッフに付与して、店舗全体での運用が可能です。",
  },
  {
    icon: "📊",
    title: "施工実績ダッシュボード",
    body: "月別・施工種別の発行枚数をグラフで確認。営業活動の振り返りに活用できます。",
  },
];

function FeatureSection() {
  return (
    <Section className="bg-white">
      <SectionHeading
        eyebrow="Features"
        title="施工店に必要な機能を、すべて。"
        body="複雑な設定は不要。導入当日から使い始められます。"
      />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-zinc-100 bg-zinc-50 p-7"
          >
            <span className="text-2xl" aria-hidden="true">{item.icon}</span>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">
              {item.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── 利用ステップ ─────────────────────────────────────────────────────────

const steps = [
  {
    step: "01",
    title: "アカウント登録（無料）",
    body: "メールアドレスで登録するだけ。最短5分でご利用開始できます。クレジットカード不要。",
  },
  {
    step: "02",
    title: "施工完了後に証明書を発行",
    body: "車両番号・施工日・施工内容を入力して発行ボタンを押すだけ。スマホからでも操作できます。",
  },
  {
    step: "03",
    title: "QRコードで顧客・保険会社へ",
    body: "発行されたQRコードを印刷、またはURLをそのまま送付。相手はすぐに証明書を確認できます。",
  },
];

function HowItWorksSection() {
  return (
    <Section className="bg-zinc-50">
      <SectionHeading
        eyebrow="How it works"
        title="使い始めるまで3ステップ"
        body="難しい初期設定はありません。"
      />

      <div className="grid gap-6 sm:grid-cols-3">
        {steps.map((item) => (
          <div key={item.step} className="rounded-2xl bg-white p-8 shadow-sm">
            <span className="text-4xl font-bold text-zinc-100">{item.step}</span>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">
              {item.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-500">
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ─── 料金誘導 ─────────────────────────────────────────────────────────────

function PricingTeaser() {
  return (
    <Section className="bg-white">
      <div className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 p-10 text-center shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Pricing
        </span>
        <h2 className="mt-2 text-2xl font-bold text-zinc-900">
          まずは無料プランから
        </h2>
        <p className="mt-4 text-zinc-500">
          小規模の施工店でも始めやすい料金設計。
          月額固定で証明書の発行枚数に応じたプランを用意しています。
        </p>
        <Link
          href="/pricing"
          className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-zinc-900 hover:underline"
        >
          料金プランの詳細を見る
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </Section>
  );
}

// ─── 最終CTA ──────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <Section className="bg-zinc-900">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          今すぐ無料でお試しください
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-zinc-400">
          初期費用・クレジットカード登録不要。
          導入サポート付きで、当日から使い始められます。
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="rounded-full bg-white px-7 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            お問い合わせ・資料請求
          </Link>
          <Link
            href={siteConfig.loginUrl}
            className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            アカウント登録（無料）
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────

export default function ForShopsPage() {
  return (
    <>
      <HeroSection />
      <PainPointSection />
      <FeatureSection />
      <HowItWorksSection />
      <PricingTeaser />
      <CtaSection />
    </>
  );
}

export const metadata: Metadata = {
  title: `施工店の方へ | ${siteConfig.siteName}`,
  description:
    "施工証明書の発行・管理をデジタル化。紙の証明書・手書き記録・保険会社への確認連絡をなくし、施工店の業務効率を改善します。",
  openGraph: {
    title: `施工店の方へ | ${siteConfig.siteName}`,
    description:
      "施工証明書の発行・管理をデジタル化。紙の証明書・手書き記録・保険会社への確認連絡をなくし、施工店の業務効率を改善します。",
    url: `${siteConfig.siteUrl}/for-shops`,
  },
  twitter: {
    title: `施工店の方へ | ${siteConfig.siteName}`,
    description:
      "施工証明書の発行・管理をデジタル化。紙の証明書・手書き記録・保険会社への確認連絡をなくし、施工店の業務効率を改善します。",
  },
};
