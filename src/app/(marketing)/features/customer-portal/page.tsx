import { PageHero } from "@/components/marketing/PageHero";
import { Breadcrumbs } from "@/components/marketing/Breadcrumbs";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

export const metadata = {
  title: "顧客ポータル",
  description:
    "QRコードを読むだけで、顧客が自分の施工証明書をスマートフォンで閲覧・ダウンロード・共有。問い合わせ対応ゼロ、顧客満足度アップ。",
  alternates: { canonical: "/features/customer-portal" },
};

const problems = [
  {
    title: "「証明書をもう一枚ください」の電話",
    desc: "車を売るとき、保険を請求するとき。施工から数ヶ月後に「あの証明書はどこ？」と顧客から電話がかかってくる。その対応が担当者の時間を食い続けます。",
  },
  {
    title: "紙の証明書は顧客が失くす",
    desc: "施工店が丁寧に証明書を発行しても、顧客が保管しなければ意味がありません。紙は引き出しの奥に埋もれ、必要なときに出てこない。",
  },
  {
    title: "「本物か確認したい」への答えがない",
    desc: "中古車購入者や保険担当者が「本当にコーティングされているのか」を確かめる手段がありません。施工店に連絡する手間は双方にとって非効率です。",
  },
];

const steps = [
  {
    step: "1",
    title: "施工完了時にQRコードつき証明書を発行",
    desc: "施工後、管理画面からワンクリックで証明書を発行します。QRコード・公開URL・PDFがセットで生成されます。メール・LINE・印刷でそのまま顧客に渡せます。",
  },
  {
    step: "2",
    title: "顧客がスマートフォンで開く",
    desc: "顧客がQRコードを読んだり、URLをタップするだけで証明書ページが開きます。アプリのインストールは不要。ブラウザで即座に表示されます。",
  },
  {
    step: "3",
    title: "施工内容・写真・担当者を確認",
    desc: "施工内容の詳細・使用した材料・施工写真・担当者・施工日がすべて1画面に。ブロックチェーン検証バッジで改ざん検知済みであることも確認できます。",
  },
  {
    step: "4",
    title: "PDFで保存・共有",
    desc: "顧客がPDFをダウンロード・保存・転送できます。車を売るとき、保険を請求するとき、次の施工店に見せるとき——証明書は顧客の手元に永続的に残ります。",
  },
];

const features = [
  {
    title: "ログイン不要・URLで即開く",
    description:
      "顧客は会員登録もログインも不要。QRコードまたはURLをタップするだけで証明書ページが表示されます。摩擦ゼロで顧客体験を守ります。",
  },
  {
    title: "改ざん検知バッジ",
    description:
      "Polygon ブロックチェーンによる検証結果をバッジで表示。『この証明書は発行後に改変されていない』ことを顧客が自分で確認できます。",
  },
  {
    title: "施工写真の一覧表示",
    description: "施工前後の写真をギャラリー形式で表示。ビフォーアフターが一目で分かり、施工品質を直感的に伝えます。",
  },
  {
    title: "PDF ダウンロード",
    description:
      "A4縦のPDF形式でダウンロード可能。保険会社提出・車両売却時の添付・自己保管に対応したフォーマットです。",
  },
  {
    title: "複数言語対応（予定）",
    description: "外国籍のオーナーへの対応。日本語以外の言語での表示に順次対応予定です。",
  },
  {
    title: "テナントブランディング",
    description: "施工店のロゴ・名称・連絡先を証明書ページに表示。顧客との接点でブランドを強化できます。",
  },
];

const usecases = [
  {
    icon: "🚗",
    title: "中古車として売るとき",
    desc: "買主にQRを見せるだけで「コーティング済み・PPF施工済み」が第三者検証付きで証明できる。口頭説明ではなく、データで価値が伝わります。",
  },
  {
    icon: "🛡️",
    title: "保険請求するとき",
    desc: "事故後の保険請求で「施工の記録」を求められたとき、保険担当者にURLを送るだけ。電話や郵送での書類送付が不要になります。",
  },
  {
    icon: "🔧",
    title: "別の施工店でメンテナンスするとき",
    desc: "転居や引越しで別の施工店に行くとき、「前にどんなコーティングをしたか」を証明書で正確に伝えられます。適切なメンテナンスにつながります。",
  },
  {
    icon: "🎁",
    title: "ギフトとして",
    desc: "車へのコーティングをプレゼントした場合、デジタル証明書を贈ることができます。「施工の記念」として顧客のスマートフォンに残ります。",
  },
];

export default function CustomerPortalPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "顧客ポータル", url: "/features/customer-portal" },
        ]}
      />
      <PageHero
        badge="FEATURE › 顧客ポータル"
        title="顧客が、いつでも証明書を見られる。"
        subtitle="QRコードかURLを渡すだけ。顧客がスマートフォンで施工内容・写真・担当者を確認できます。再発行依頼の電話がなくなり、車を売るときの証明書もすぐ出てきます。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="「もう一度送ってください」は、無くせる"
          subtitle="再発行対応の電話は、施工品質とは無関係なコストです。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow */}
      <Section>
        <SectionHeading
          title="発行から顧客確認まで"
          subtitle="施工店の操作は証明書を発行するだけ。あとは顧客が自分で管理します。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {steps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-sm font-bold text-blue-300 border border-blue-500/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{s.title}</h3>
                  <p className="mt-2 text-[0.938rem] leading-[1.85] text-white">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Mobile mockup */}
      <Section bg="alt">
        <SectionHeading
          title="顧客が見る画面"
          subtitle="アプリ不要。ブラウザで開くだけで、施工の全情報が揃っています。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-xs">
            <div className="rounded-[2.5rem] border-[6px] border-white/[0.12] bg-[#0a0a0f] shadow-2xl overflow-hidden">
              <div className="px-5 pt-6 pb-8 space-y-4">
                {/* Status bar mock */}
                <div className="flex justify-between items-center">
                  <span className="text-[0.625rem] text-white font-medium">9:41</span>
                  <div className="flex gap-1.5 items-center">
                    <div className="w-3 h-1.5 rounded-sm bg-white/40" />
                    <div className="w-1 h-1.5 rounded-sm bg-white/40" />
                    <div className="w-1 h-1.5 rounded-sm bg-white/40" />
                  </div>
                </div>

                {/* Header badge */}
                <div className="text-center">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
                    <span className="text-[0.563rem] font-medium text-green-300">Polygon 検証済み</span>
                  </div>
                </div>

                {/* Certificate header */}
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.07] p-4">
                  <p className="text-[0.625rem] text-blue-300 uppercase tracking-widest font-semibold">施工証明書</p>
                  <p className="mt-1 text-sm font-bold text-white">ガラスコーティング 5年</p>
                  <p className="text-[0.688rem] text-white mt-1">トヨタ アルファード | 品川 300 あ 12-34</p>
                  <div className="mt-2 flex gap-3">
                    <div>
                      <p className="text-[0.5rem] text-white">施工日</p>
                      <p className="text-[0.688rem] font-medium text-white">2024年11月15日</p>
                    </div>
                    <div>
                      <p className="text-[0.5rem] text-white">施工店</p>
                      <p className="text-[0.688rem] font-medium text-white">プレミアムコート東京</p>
                    </div>
                  </div>
                </div>

                {/* Photos mock */}
                <div>
                  <p className="text-[0.625rem] text-white uppercase tracking-widest mb-2">施工写真</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {["before", "during", "after"].map((label) => (
                      <div
                        key={label}
                        className="aspect-square rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-end justify-end p-1"
                      >
                        <span className="text-[0.5rem] text-white">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button className="flex-1 rounded-xl bg-blue-600/80 py-2 text-[0.688rem] font-bold text-white">
                    PDFをダウンロード
                  </button>
                  <button className="rounded-xl border border-white/[0.12] bg-white/[0.05] px-3 py-2">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-4 w-4 text-white"
                    >
                      <path d="M13.5 6H17v9H3V6h3.5M10 3v9m-3-3l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-white">顧客のスマートフォンで開く証明書ページ（イメージ）</p>
          </div>
        </ScrollReveal>
      </Section>

      {/* Use cases */}
      <Section>
        <SectionHeading title="顧客が使う場面" subtitle="発行から1年後、2年後に価値が証明されます。" />
        <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-5">
          {usecases.map((u, i) => (
            <ScrollReveal key={u.title} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                <div className="text-3xl leading-none shrink-0">{u.icon}</div>
                <div>
                  <h3 className="text-[1.063rem] font-bold text-white leading-snug">{u.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white">{u.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section bg="alt" id="features">
        <SectionHeading title="顧客ポータルの機能" subtitle="顧客が自分で完結できる設計です。" />
        <FeatureGrid className="mt-10">
          {features.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="顧客がURLを失くした場合はどうなりますか？"
            answer="施工店の管理画面から再度URLやQRコードを発行・送信できます。証明書データは永続的に保管されていますので、顧客が「失くした」場合でも即座に再共有が可能です。"
          />
          <FAQItem
            question="第三者（買主・保険会社）が確認することはできますか？"
            answer="はい。証明書ページはパブリックURLで誰でも閲覧可能です（証明書のURL/QRを持っている人のみ）。ブロックチェーン検証バッジも表示されるため、第三者が真正性を確認できます。"
          />
          <FAQItem
            question="証明書の有効期限はありますか？"
            answer="証明書に有効期限はありません。一度発行された証明書は、Ledra サービスが継続する限り永続的に閲覧可能です。施工店側が明示的に無効化した場合は無効ステータスが表示されます。"
          />
          <FAQItem
            question="顧客ポータルをカスタマイズできますか？"
            answer="施工店のロゴ・店舗名・連絡先を表示するテナントブランディングに対応しています。独自ドメインでの運用については Enterprise プランでご相談ください。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="発行後も、顧客に価値を届け続ける。"
        subtitle="QRコードを渡すだけで、施工の証明が顧客のスマートフォンに永続的に残ります。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#verification"
        trackLocation="customer-portal-cta"
      />
    </>
  );
}
