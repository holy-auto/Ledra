import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { CTABanner } from "@/components/marketing/CTABanner";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "未来予想図 ── 2030年、施工履歴が車と一緒に旅をする",
  description:
    "Ledra が目指す未来。施工店・保険会社・中古車流通・次のオーナーまで、車の履歴が途切れずつながる世界。確定していること・開発中のこと・構想段階のことを、正直に3段階で公開しています。",
  alternates: { canonical: "/vision" },
  openGraph: {
    title: "未来予想図 | Ledra",
    description: "施工履歴が車と一緒に旅をする世界。確定・開発中・構想を正直に公開するロードマップ。",
    url: "/vision",
    siteName: "Ledra",
    locale: "ja_JP",
    type: "website",
  },
};

type Lane = "shipped" | "building" | "concept";

const laneMeta: Record<Lane, { label: string; color: string; dot: string; desc: string }> = {
  shipped: {
    label: "確定・提供中",
    color: "text-emerald-300",
    dot: "bg-emerald-400",
    desc: "すでにお使いいただけます",
  },
  building: { label: "開発中", color: "text-blue-300", dot: "bg-blue-400", desc: "着手済み・時期は未確定です" },
  concept: { label: "構想", color: "text-white/70", dot: "bg-white/40", desc: "実現方式は未確定です" },
};

const items: { lane: Lane; title: string; body: string }[] = [
  {
    lane: "shipped",
    title: "施工証明書のデジタル発行・改ざん検知",
    body: "写真・施工内容・施工者・日時をまとめ、ブロックチェーンにハッシュを刻む証明書として発行できます。",
  },
  {
    lane: "shipped",
    title: "保険会社が URL でそのまま照会",
    body: "登録不要で証明書の内容と真正性を確認できます。査定のエビデンスとして今も使われています。",
  },
  {
    lane: "shipped",
    title: "全国の実数を隠さず公開",
    body: "導入社数・発行件数は本番データベースの実数をそのまま表示しています。盛った数字は載せません。",
  },
  {
    lane: "building",
    title: "車両単位のライフタイム履歴",
    body: "1台の車に紐づく施工・点検・修理の記録を、施工店をまたいで時系列に統合表示する機能を開発しています。",
  },
  {
    lane: "building",
    title: "中古車流通事業者との API 連携",
    body: "査定・出品システムに施工履歴を直接引き渡す連携を、PoC パートナーと検証中です。",
  },
  {
    lane: "building",
    title: "NFC タグでの現地照会の拡充",
    body: "スマホをかざすだけでの照会体験を、より多くの施工メニューへ広げています。",
  },
  {
    lane: "concept",
    title: "オーナー間で引き継がれる車の履歴パスポート",
    body: "売買のたびに履歴が途切れず、次のオーナーにもそのまま引き継がれる仕組み。実現方式（本人確認・移転プロトコル等）は未確定です。",
  },
  {
    lane: "concept",
    title: "業界横断の標準フォーマット化",
    body: "Ledra の証明書フォーマットが、施工店・メーカー・保険会社の間で共通言語になる未来。他社の巻き込み方も含め構想段階です。",
  },
  {
    lane: "concept",
    title: "車検・査定機関との公式連携",
    body: "公的な検査・査定プロセスにデジタル証明が正式に組み込まれる形。制度面の検討が前提で、時期は見通せていません。",
  },
];

export default function VisionPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "未来予想図", url: "/vision" }]} />
      <PageHero
        badge="VISION"
        title="2030年、施工履歴は車と一緒に旅をする。"
        subtitle="施工店で生まれた記録が、保険会社の査定にも、中古車流通にも、次のオーナーにも、途切れずつながっていく。Ledra が見ている未来です。"
      />

      <Section>
        <SectionHeading
          title="確定・開発中・構想を、分けて公開します"
          subtitle="「いつかできる」と「もう使える」を混ぜて見せることはしません。嘘のない未来予想図です。"
        />
        <div className="mx-auto max-w-4xl space-y-14">
          {(["shipped", "building", "concept"] as const).map((lane) => (
            <div key={lane}>
              <ScrollReveal variant="fade-up">
                <div className="mb-6 flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${laneMeta[lane].dot}`} />
                  <h3 className={`text-sm font-bold uppercase tracking-widest ${laneMeta[lane].color}`}>
                    {laneMeta[lane].label}
                  </h3>
                  <span className="text-xs text-white/50">{laneMeta[lane].desc}</span>
                </div>
              </ScrollReveal>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {items
                  .filter((it) => it.lane === lane)
                  .map((it, i) => (
                    <ScrollReveal key={it.title} variant="fade-up" delay={i * 80}>
                      <div className="h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                        <h4 className="text-sm font-bold text-white">{it.title}</h4>
                        <p className="mt-2.5 text-sm leading-relaxed text-white/85">{it.body}</p>
                      </div>
                    </ScrollReveal>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section bg="alt">
        <SectionHeading title="なぜ「つながる履歴」を目指すのか" />
        <div className="mx-auto max-w-3xl space-y-6 text-sm md:text-base leading-relaxed text-white/90">
          <ScrollReveal variant="fade-up">
            <p>
              いま車の履歴は、施工店ごと・持ち主が変わるごとにバラバラに途切れています。良い施工をしても、次の持ち主にはその価値が伝わりません。
            </p>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={100}>
            <p>
              Ledra
              が目指すのは、1台の車についた記録が生涯を通して途切れないことです。施工店の技術が正当に評価され、保険会社が正確に査定でき、次のオーナーが安心して買える——それぞれの立場が同じ事実を見られる状態を作ります。
            </p>
          </ScrollReveal>
          <ScrollReveal variant="fade-up" delay={200}>
            <p>
              構想段階のものは実現時期も方式も未確定です。進捗は
              <Link href="/financial-transparency" className="mx-1 text-blue-400 hover:underline">
                透明性ダッシュボード
              </Link>
              で継続的に公開していきます。
            </p>
          </ScrollReveal>
        </div>
      </Section>

      <CTABanner
        title="この未来を、一緒につくる施工店を探しています。"
        subtitle="今できることは無料で試せます。構想の実現は、使ってくださる方の数だけ近づきます。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="創業ストーリーを読む"
        secondaryHref="/story"
        trackLocation="vision-final"
      />
    </>
  );
}
