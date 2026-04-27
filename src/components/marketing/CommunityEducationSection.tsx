import Link from "next/link";
import { Section } from "./Section";
import { SectionHeading } from "./SectionHeading";
import { ScrollReveal } from "./ScrollReveal";

/**
 * CommunityEducationSection — Ledra の利用者コミュニティ・教育コンテンツ・
 * イベントを一つの面で訴求する。Ledra Academy も含む。
 *
 * SmartHR の継続率を支えるコミュニティ運営に倣い、Ledra も「ユーザー同士の
 * 学び合い」を最初から設計する。立ち上げ期は「いま誰でも入れる」訴求に
 * 全振りする。
 */

const PILLARS = [
  {
    badge: "Ledra Academy",
    title: "技術と業務を、続けて学べる。",
    desc: "施工技術の解説、業務フローの設計、保険会社対応のベストプラクティスを、動画と記事で配信。新人教育にも使えます。",
    href: "/resources",
    cta: "教材を見る",
  },
  {
    badge: "Community",
    title: "同業オーナーで学び合うコミュニティ",
    desc: "Ledra ユーザー限定のクローズドコミュニティ。料金・接客・代理店交渉まで、明日使える知見を共有しています。",
    href: "/contact",
    cta: "招待を依頼",
  },
  {
    badge: "Events",
    title: "毎月のオンライン勉強会・年次オフライン",
    desc: "新機能アップデート、活用 Tips、業界トレンドを月次で配信。年に一度のオフライン懇親会も。",
    href: "/events",
    cta: "イベントを見る",
  },
  {
    badge: "Help Center",
    title: "ヘルプセンター・チュートリアル",
    desc: "「触ってわかる」を徹底するために、機能ごとの動画・FAQ・ステップ手順を整備中。",
    href: "/support",
    cta: "ヘルプセンターへ",
  },
];

export function CommunityEducationSection() {
  return (
    <Section bg="alt" id="community">
      <SectionHeading
        title="使えるようになるまで、一緒に学ぶ場をつくる。"
        subtitle="ツールを契約しただけで現場が変わるわけではありません。Ledra は教材・コミュニティ・イベントを通じて、使いこなしまでを支えます。"
      />

      <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-5">
        {PILLARS.map((p, i) => (
          <ScrollReveal key={p.badge} variant="fade-up" delay={i * 80}>
            <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors flex flex-col">
              <span className="inline-flex w-fit items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-widest text-violet-200">
                {p.badge}
              </span>
              <h3 className="mt-4 text-base font-bold text-white leading-snug">{p.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/80 flex-1">{p.desc}</p>
              <Link
                href={p.href}
                className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
              >
                {p.cta} &rarr;
              </Link>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </Section>
  );
}
