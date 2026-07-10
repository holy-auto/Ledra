import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PoC プログラム ── メーカー・保険会社・大手流通の方へ",
  description:
    "自動車メーカー・損害保険会社・中古車流通企業向けの PoC（概念実証）プログラム。施工履歴の改ざん不可能な記録・査定エビデンス連携・API 連携を、NDA 締結のうえ短期間で検証できます。",
  alternates: { canonical: "/poc-program" },
  openGraph: {
    title: "PoC プログラム | Ledra",
    description: "施工履歴のデジタル証明を、貴社のデータ・業務フローで検証する PoC プログラム。",
    url: "/poc-program",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
};

const themes = [
  {
    title: "査定エビデンスとしての施工履歴",
    body: "保険査定・下取り査定の場面で、改ざん不可能な施工証明が判断材料としてどこまで機能するかを、実データに近い形で検証します。",
  },
  {
    title: "既存システムとの API 連携",
    body: "貴社の査定システム・DMS・在庫管理と Ledra の証明書データを API で接続し、業務フローに乗るかを確認します。",
  },
  {
    title: "真正性検証（アンカリング）の実務評価",
    body: "ブロックチェーンに記録された施工証明を、第三者の立場で独立に検証するオペレーションを実際に回して評価します。",
  },
  {
    title: "系列・提携施工店ネットワークでの運用",
    body: "複数拠点・提携工場をまたぐ発行・閲覧・権限管理が、貴社のガバナンス要件に耐えるかを確認します。",
  },
];

const steps = [
  {
    step: "1",
    title: "NDA 締結・課題ヒアリング",
    body: "秘密保持契約を結んだうえで、貴社の検証したい仮説と評価基準をすり合わせます。",
  },
  {
    step: "2",
    title: "検証設計（目安 2週間）",
    body: "対象データ・接続方式・成功条件を文書化します。検証しないことも先に決め、PoC の空中分解を防ぎます。",
  },
  {
    step: "3",
    title: "検証実施・報告（目安 8週間）",
    body: "専用環境で検証を実施し、評価基準に対する結果と、本導入時の課題を率直に報告します。",
  },
];

export default function PocProgramPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "PoC プログラム", url: "/poc-program" }]} />
      <PageHero
        badge="POC PROGRAM"
        title="施工履歴の信頼を、貴社の現場で検証する。"
        subtitle="自動車メーカー・損害保険会社・中古車流通企業向けの PoC（概念実証）プログラムです。「改ざん不可能な施工証明」が貴社の査定・保証・流通の業務で本当に機能するかを、短期間・限定範囲で確かめられます。"
      />

      <Section>
        <SectionHeading title="検証テーマの例" subtitle="貴社の課題に合わせて設計します。以下は代表例です。" />
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {themes.map((t, i) => (
            <ScrollReveal key={t.title} variant="fade-up" delay={i * 80}>
              <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7">
                <h3 className="text-base font-bold text-white">{t.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/90">{t.body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      <Section bg="alt">
        <SectionHeading title="進め方" subtitle="NDA から報告まで、標準で約10週間です。" />
        <ol className="mx-auto max-w-3xl space-y-8">
          {/* li を ol の直下に置く（ol > div > li は不正な HTML でスクリーンリーダーの項目数が壊れる） */}
          {steps.map((s, i) => (
            <li key={s.step}>
              <ScrollReveal variant="fade-up" delay={i * 100} className="flex items-start gap-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-bold text-white shadow-[0_0_16px_rgba(59,130,246,0.4)]">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/90">{s.body}</p>
                </div>
              </ScrollReveal>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <SectionHeading title="安心して検証いただくために" />
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              title: "セキュリティ体制",
              body: "認証・権限分離・監査ログなど、システムのセキュリティ設計を公開しています。",
              href: "/security",
              link: "セキュリティを見る",
            },
            {
              title: "データの取り扱い",
              body: "どのデータを、誰が、どこまで見られるか。データ開示方針を明文化しています。",
              href: "/data-disclosure",
              link: "データ開示方針を見る",
            },
            {
              title: "実績は正直に",
              body: "PoC 実績は現在募集を開始した段階です。導入数・発行数の実数も隠さず公開しています。",
              href: "/financial-transparency",
              link: "実数を見る",
            },
          ].map((c, i) => (
            <ScrollReveal key={c.title} variant="fade-up" delay={i * 80}>
              <div className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7">
                <h3 className="text-base font-bold text-white">{c.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-white/90">{c.body}</p>
                <Link href={c.href} className="mt-4 text-sm font-medium text-blue-400 hover:underline">
                  {c.link} &rarr;
                </Link>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      <CTABanner
        title="まずは 30 分、課題をお聞かせください。"
        subtitle="貴社の検証したい仮説に合わせて、PoC の設計案をご提案します。"
        primaryLabel="PoC の相談をする"
        primaryHref="/contact"
        secondaryLabel="資料ダウンロード"
        secondaryHref="/resources"
        trackLocation="poc-program-final"
      />
    </>
  );
}
