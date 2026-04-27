import Link from "next/link";
import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import { CTAButton } from "@/components/marketing/CTAButton";
import { CasesEmptyIllustration } from "@/components/marketing/CasesEmptyIllustration";
import { listContent } from "@/lib/marketing/content";

export const metadata = {
  title: "導入事例",
  description:
    "Ledra を導入いただいている施工店・代理店・保険会社の事例をご紹介します。",
  alternates: { canonical: "/cases" },
};

export default async function CasesPage() {
  const entries = await listContent("cases");

  return (
    <>
      <PageHero
        badge="CASES"
        title="導入事例"
        subtitle="Ledra を業務の一部として使い始めた方々と、その現場の変化を、これから一つずつご紹介していきます。"
      />

      <Section>
        {entries.length === 0 ? (
          <div className="mx-auto max-w-2xl">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-10 md:p-14 text-center">
              <CasesEmptyIllustration className="mx-auto mb-8 max-w-[360px] w-full" />
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20">
                COMING SOON
              </div>
              <h2 className="mt-6 text-2xl md:text-3xl font-bold text-white leading-tight">
                この場所には、あなたの事例が入る。
              </h2>
              <p className="mt-5 text-[0.938rem] md:text-base leading-[1.9] text-white/80 max-w-xl mx-auto">
                Ledra は正式サービスを開始したばかりです。いま、先行導入に参加いただける施工店・代理店・保険会社様を募集しています。
                <br />
                <br />
                「はじめての1社」として、業界の記録文化を一緒に作り直していただける方と、お話ししたいと考えています。
              </p>
              <div className="mt-10 flex flex-col sm:flex-row justify-center gap-3">
                <CTAButton variant="primary" href="/contact" trackLocation="cases-empty">
                  パイロット参加を申し込む
                </CTAButton>
                <CTAButton variant="outline" href="/support" trackLocation="cases-empty">
                  導入支援を見る
                </CTAButton>
              </div>
            </div>

            <p className="mt-10 text-center text-xs text-white/75 leading-relaxed">
              事例の取材・記事化は、Ledra 側で伴走してまとめます。
              <br />
              ご負担なくご参加いただけます。
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
            {entries.map((e, i) => (
              <ScrollReveal key={e.frontmatter.slug} variant="fade-up" delay={i * 60}>
                <Link
                  href={`/cases/${e.frontmatter.slug}`}
                  className="group block h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 md:p-8 hover:bg-white/[0.06] hover:border-white/[0.14] hover:shadow-[0_0_28px_rgba(59,130,246,0.1)] hover:-translate-y-1 transition-all duration-400"
                >
                  {(e.frontmatter.company || e.frontmatter.industry) && (
                    <div className="flex flex-wrap items-center gap-2 text-[0.688rem] font-medium text-white/80">
                      {e.frontmatter.industry && <span>{String(e.frontmatter.industry)}</span>}
                      {e.frontmatter.company && (
                        <>
                          <span className="text-white/70">•</span>
                          <span>{String(e.frontmatter.company)}</span>
                        </>
                      )}
                    </div>
                  )}
                  <h2 className="mt-4 text-[1.125rem] md:text-[1.25rem] font-bold text-white group-hover:text-blue-200 transition-colors leading-[1.4]">
                    {e.frontmatter.title}
                  </h2>
                  {e.frontmatter.excerpt && (
                    <p className="mt-4 text-[0.938rem] leading-[1.75] text-white/80">
                      {e.frontmatter.excerpt}
                    </p>
                  )}
                  <p className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
                    事例を読む →
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        )}
      </Section>

      <CTABanner
        title="事例掲載にご協力いただける方を募集中"
        subtitle="パイロット参加企業様には、事例化・ロゴ掲載・プレスリリース発信までご一緒に。"
        primaryLabel="パイロット参加を申し込む"
        primaryHref="/contact"
        secondaryLabel="導入支援を見る"
        secondaryHref="/support"
      />
    </>
  );
}
