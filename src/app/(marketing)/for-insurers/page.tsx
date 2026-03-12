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
          保険会社の方へ
        </span>

        <h1 className="mt-6 text-4xl font-bold leading-snug tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          施工証明の確認業務、
          <br />
          もっとスムーズに。
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-zinc-500">
          施工店への確認連絡・書類の真正性チェック・保管管理——
          CARTRUSTは保険査定に必要な証明業務をリアルタイムに、確実に。
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="rounded-full bg-zinc-900 px-7 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            導入相談・資料請求
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

// ─── 課題 → 解決 ──────────────────────────────────────────────────────────

const painPoints = [
  {
    before: "施工証明書の真正性を確認するために施工店に連絡している",
    after: "QRコードで即時検証——改ざん不可の電子証明を直接確認",
  },
  {
    before: "施工店から送られる書類の形式がバラバラで管理が煩雑",
    after: "統一フォーマットの電子証明書をWeb上で一覧管理",
  },
  {
    before: "紙の証明書の保管・検索に時間とコストがかかる",
    after: "クラウド保管でペーパーレス、車両番号・日付で瞬時に検索",
  },
  {
    before: "証明書の偽造リスクへの対応が難しい",
    after: "発行後の変更を検知する改ざん防止機能で不正を防止",
  },
];

function PainPointSection() {
  return (
    <Section className="bg-zinc-50">
      <SectionHeading
        eyebrow="Before / After"
        title="保険査定の現場が変わります"
        body="CARTRUST導入前後の変化です。"
      />

      <div className="flex flex-col gap-4">
        {painPoints.map((item, i) => (
          <div
            key={i}
            className="grid gap-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:grid-cols-2"
          >
            <div className="flex items-start gap-3 border-b border-zinc-100 p-6 sm:border-b-0 sm:border-r">
              <span className="mt-0.5 flex-shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-400">
                Before
              </span>
              <p className="text-sm text-zinc-600">{item.before}</p>
            </div>
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

// ─── 機能 ─────────────────────────────────────────────────────────────────

const features = [
  {
    icon: "🔍",
    title: "QRコードで即時真正性確認",
    body: "施工店が発行したQRコードを読み取るだけ。証明書の内容と発行元を数秒で確認できます。",
  },
  {
    icon: "🛡",
    title: "改ざん検知・発行元の検証",
    body: "証明書は発行後に変更不可。改ざんされた証明書は自動で検知し、不正を未然に防ぎます。",
  },
  {
    icon: "📋",
    title: "証明書の一括ダッシュボード",
    body: "提携施工店からの証明書を一覧表示。車両番号・施工日・種別でフィルタリングできます。",
  },
  {
    icon: "🔌",
    title: "既存システムとのAPI連携",
    body: "保険基幹システムやDWHへのデータ連携をAPIで実現。証明書データを自動取り込みできます。",
  },
  {
    icon: "📁",
    title: "ペーパーレス・長期保管",
    body: "紙の証明書は不要。クラウドで安全に長期保管し、監査対応もスムーズに行えます。",
  },
  {
    icon: "📨",
    title: "リアルタイム通知",
    body: "提携施工店が証明書を発行した瞬間に通知。査定担当者がタイムリーに確認できます。",
  },
];

function FeatureSection() {
  return (
    <Section className="bg-white">
      <SectionHeading
        eyebrow="Features"
        title="保険査定に必要な機能を、すべて。"
        body="既存の業務フローを壊さず、デジタル化を実現します。"
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

// ─── 連携フロー ───────────────────────────────────────────────────────────

const flowSteps = [
  {
    step: "01",
    title: "提携施工店のオンボーディング",
    body: "CARTRUSTを利用している施工店と提携設定するだけ。複雑な初期設定は不要です。",
  },
  {
    step: "02",
    title: "施工完了後に証明書が自動連携",
    body: "施工店が証明書を発行すると、保険会社のダッシュボードにリアルタイムで届きます。",
  },
  {
    step: "03",
    title: "Web上で確認・査定に活用",
    body: "証明書の内容をブラウザで確認。そのまま査定フローに組み込めます。",
  },
];

function FlowSection() {
  return (
    <Section className="bg-zinc-50">
      <SectionHeading
        eyebrow="Integration flow"
        title="導入から利用まで3ステップ"
      />

      <div className="grid gap-6 sm:grid-cols-3">
        {flowSteps.map((item) => (
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

// ─── 最終CTA ──────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <Section className="bg-zinc-900">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          まずはお気軽にご相談ください
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-zinc-400">
          導入の流れ・API仕様・セキュリティ要件など、詳しい資料をお送りします。
          担当者によるオンライン説明会も承っています。
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/contact"
            className="rounded-full bg-white px-7 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            資料請求・導入相談
          </Link>
          <Link
            href={`mailto:${siteConfig.contactEmail}`}
            className="rounded-full border border-zinc-700 px-7 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            {siteConfig.contactEmail}
          </Link>
        </div>
      </div>
    </Section>
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────

export default function ForInsurersPage() {
  return (
    <>
      <HeroSection />
      <PainPointSection />
      <FeatureSection />
      <FlowSection />
      <CtaSection />
    </>
  );
}

export const metadata: Metadata = {
  title: `保険会社の方へ | ${siteConfig.siteName}`,
  description:
    "施工証明書の真正性確認・保管管理・API連携をデジタル化。保険査定の効率化と不正防止を同時に実現するSaaSプラットフォームです。",
};
