import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";
import { listContent } from "@/lib/marketing/content";

/**
 * CustomerCasesSection — 「実名 × 数値効果」での事例ブロック。
 *
 * 0件のときは隠さず、「最初の1社になれる」訴求に切り替える。
 * SmartHR の事例ブロックは数字で殴ってくるが、Ledra は出てくるまで誠実に
 * 「これから書かれる」と提示する設計を採る。
 */

const PLACEHOLDER_RESULTS = [
  { metric: "電話・FAX照会", value: "ゼロ化", note: "保険会社からの個別問い合わせがURL閲覧に置き換わる想定" },
  { metric: "証明書1枚あたり", value: "5分以下", note: "テンプレート化で発行作業を短縮" },
  { metric: "顧客への共有", value: "即時", note: "QR / URL で発行直後にシェア" },
];

export async function CustomerCasesSection() {
  const cases = await listContent("cases");
  const has = cases.length > 0;

  return (
    <Section id="cases">
      <SectionHeading
        title="お客様の声"
        subtitle="Ledra の数字は、現場で動かしてくださっている方々の数字でもあります。"
      />

      {has ? (
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cases.slice(0, 6).map((e, i) => (
            <ScrollReveal key={e.frontmatter.slug} variant="fade-up" delay={i * 60}>
              <Link
                href={`/cases/${e.frontmatter.slug}`}
                className="group block h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5 transition-all"
              >
                {(e.frontmatter.company || e.frontmatter.industry) && (
                  <div className="flex flex-wrap items-center gap-2 text-[0.688rem] font-medium text-white/85">
                    {e.frontmatter.industry && <span className="text-white/85">{String(e.frontmatter.industry)}</span>}
                    {e.frontmatter.company && (
                      <>
                        <span className="text-white/60">•</span>
                        <span className="text-white/85">{String(e.frontmatter.company)}</span>
                      </>
                    )}
                  </div>
                )}
                <h3 className="mt-3 text-base font-bold text-white group-hover:text-blue-200 transition-colors leading-snug">
                  {e.frontmatter.title}
                </h3>
                {e.frontmatter.excerpt && (
                  <p className="mt-3 text-sm leading-relaxed text-white/80">{e.frontmatter.excerpt}</p>
                )}
                <p className="mt-5 text-xs font-medium text-blue-300 group-hover:text-blue-200 transition-colors">
                  事例を読む &rarr;
                </p>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      ) : (
        <ScrollReveal variant="fade-up">
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 md:p-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[0.65rem] font-medium text-blue-300 uppercase tracking-wider">
              <span className="block w-1.5 h-1.5 rounded-full bg-blue-300 animate-[pulse-soft_2s_ease-in-out_infinite]" />
              第1号事例 募集中
            </div>
            <h3 className="mt-5 text-xl md:text-2xl font-bold text-white leading-snug">
              この場所には、あなたの店舗の名前が入ります。
            </h3>
            <p className="mt-4 text-sm md:text-base leading-[1.9] text-white/80">
              Ledra は正式提供を開始したばかりで、まだ「歴史の最初の数社」を募集している段階です。事例化・記事化は Ledra
              側で完全に伴走するので、現場の負担なくご参加いただけます。
            </p>

            <dl className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {PLACEHOLDER_RESULTS.map((r) => (
                <div key={r.metric} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <dt className="text-[0.65rem] font-medium uppercase tracking-widest text-white/70">{r.metric}</dt>
                  <dd className="mt-2 text-xl font-bold text-white">{r.value}</dd>
                  <p className="mt-2 text-[0.65rem] leading-relaxed text-white/70">{r.note}</p>
                </div>
              ))}
            </dl>

            <p className="mt-5 text-[0.65rem] text-white/70 leading-relaxed">
              ※ 上記は先行設計値・想定値です。実数値は事例公開時に置き換えます。
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 bg-white text-[#060a12] hover:bg-gray-100 transition-colors"
              >
                パイロット参加を相談する
              </Link>
              <Link
                href="/cases"
                className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-6 py-3 border border-white/20 text-white/80 hover:text-white hover:border-white/40 transition-colors"
              >
                事例ページへ
              </Link>
            </div>
          </div>
        </ScrollReveal>
      )}
    </Section>
  );
}
