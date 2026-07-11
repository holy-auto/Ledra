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
  title: "デジタル施工証明書",
  description:
    "コーティング・PPF・板金など施工の全記録を、写真・施工者・日時つきのデジタル証明書として発行。QRコードで即共有、ブロックチェーンで改ざん不可。",
  alternates: { canonical: "/features/digital-certificate" },
};

const problems = [
  {
    title: "施工した証拠が残らない",
    desc: "どれだけ丁寧に施工しても、記録が口頭や手書きメモだけでは証明になりません。顧客が売却・保険請求するときに「証明できない」ことで、価値が伝わらなくなります。",
  },
  {
    title: "紙の書類は失われる・偽造できる",
    desc: "紙の証明書は顧客が紛失します。さらに、スキャンしたPDFは誰でも編集できます。「本物かどうか」を確かめる手段が、従来の証明書にはありませんでした。",
  },
  {
    title: "発行のたびに15分かかる",
    desc: "Wordで書いて、印刷して、署名して、スキャンして、メールする。これを毎件繰り返す運用は、件数が増えるほど現場を圧迫します。",
  },
];

const certFields = [
  { label: "施工内容", example: "ガラスコーティング / PPF フルラップ / 板金塗装など" },
  { label: "施工日・完了時刻", example: "2024-11-15 17:42" },
  { label: "施工店・担当者", example: "プレミアムコート東京 / 田中 雄介" },
  { label: "車両情報", example: "トヨタ アルファード / 品川 300 あ 12-34 / VIN: …" },
  { label: "施工写真", example: "Before / During / After（最大20枚）" },
  { label: "使用材料・グレード", example: "GYEON Q² MOHS+ / 9H相当 / 5年保証" },
  { label: "保証条件", example: "施工後6ヶ月以内の剥離は無償再施工" },
  { label: "QRコード・公開URL", example: "ledra.co.jp/c/XXXX-XXXX" },
];

const issuanceSteps = [
  {
    step: "1",
    title: "施工内容を入力",
    desc: "施工種別・材料・グレード・保証条件をフォームに入力します。テンプレートを保存しておけば、次回からはほぼ自動入力です。",
  },
  {
    step: "2",
    title: "車両を選択または新規登録",
    desc: "車両マスタから既存車両を選択、または車検証をカメラでスキャンして新規登録。どちらでも10秒以内に完了します。",
  },
  {
    step: "3",
    title: "施工写真をアップロード",
    desc: "スマートフォンのカメラでビフォーアフター写真を撮影して添付。写真にはC2PA署名が自動で付与され、後からの差し替えを検知できます。",
  },
  {
    step: "4",
    title: "発行・共有",
    desc: "「発行する」をタップするだけ。QRコード・公開URL・PDFが即生成され、Polygonへのアンカリングも自動開始。LINE・メール・印刷で顧客にすぐ渡せます。",
  },
];

const certFeatures = [
  {
    title: "30秒で発行",
    description: "テンプレートと車両マスタを使えば、入力項目は最小限。施工直後にその場で証明書を渡せます。",
  },
  {
    title: "ブロックチェーンアンカリング",
    description:
      "発行と同時に証明書コンテンツのSHA-256ハッシュをPolygonに刻印。Ledra以外の第三者が独立に改ざん検知できます。",
    href: "/features/blockchain-anchoring",
  },
  {
    title: "C2PA写真署名",
    description: "施工写真をC2PA規格で署名。後から差し替えられた写真は署名検証で即座に検知できます。",
    href: "/features/blockchain-anchoring",
  },
  {
    title: "無効化・再発行・複製",
    description:
      "誤発行は理由付きで無効化。同じ仕様の別車両には複製で発行。現場の運用実態に合わせた操作を揃えています。",
  },
  {
    title: "バッチPDF出力",
    description: "複数証明書を一括でPDF化。保険会社・監査機関・ディーラーへの一括提出をシンプルに。",
  },
  {
    title: "共有方法を選べる",
    description: "QRコード印刷・公開URL・メール・LINE通知・NFCタグ書込。顧客の状況に合わせた渡し方を選べます。",
    href: "/features/nfc",
  },
];

const lifecycleStages = [
  {
    phase: "発行時",
    color: "rgba(59,130,246,",
    events: ["施工内容・写真を記録", "QR/URL/PDFを生成", "Polygonアンカリング開始", "顧客への通知"],
  },
  {
    phase: "流通時",
    color: "rgba(168,85,247,",
    events: ["顧客がQRで閲覧", "中古車売却時の価値証明", "保険会社のポータルで照会", "NFCタグからの参照"],
  },
  {
    phase: "監査時",
    color: "rgba(34,197,94,",
    events: ["ハッシュの再計算", "Polygonとの突き合わせ", "検証バッジの表示", "操作ログの出力"],
  },
];

export default function DigitalCertificatePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "デジタル施工証明書", url: "/features/digital-certificate" },
        ]}
      />
      <PageHero
        badge="FEATURE › デジタル施工証明書"
        title="施工の記録を、改ざんできない証明書に。"
        subtitle="コーティング・PPF・板金・カーフィルム。その施工が、いつ・誰が・何をしたかを、写真付きデジタル証明書として永続的に記録します。30秒で発行、ブロックチェーンで証明。"
      />

      {/* Problems */}
      <Section bg="alt">
        <SectionHeading
          title="証明できなければ、価値は伝わらない"
          subtitle="職人の技術を、次の取引で活かせるかどうかは『記録』にかかっています。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Issuance flow */}
      <Section>
        <SectionHeading title="発行までの4ステップ" subtitle="慣れれば施工直後にその場で渡せます。" />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {issuanceSteps.map((s, i) => (
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

      {/* Certificate fields */}
      <Section bg="alt">
        <SectionHeading
          title="証明書に記録される項目"
          subtitle="現場で必要な情報を過不足なく。カスタムフィールドの追加も可能です。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-2xl border border-white/[0.08]">
            {certFields.map((f, i) => (
              <div
                key={f.label}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 px-6 py-4 ${
                  i % 2 === 0 ? "bg-white/[0.03]" : "bg-white/[0.015]"
                } ${i < certFields.length - 1 ? "border-b border-white/[0.05]" : ""}`}
              >
                <p className="w-36 shrink-0 text-xs font-semibold text-white">{f.label}</p>
                <p className="text-sm text-white">{f.example}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </Section>

      {/* Certificate lifecycle */}
      <Section>
        <SectionHeading
          title="証明書のライフサイクル"
          subtitle="発行した証明書は、施工後も何年もわたって価値を持ち続けます。"
        />
        <div className="mx-auto mt-10 max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-5">
          {lifecycleStages.map((stage, idx) => (
            <ScrollReveal key={stage.phase} variant="fade-up" delay={idx * 80}>
              <div
                className="rounded-2xl border p-6 h-full"
                style={{
                  borderColor: `${stage.color}0.25)`,
                  background: `${stage.color}0.05)`,
                }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: `${stage.color}0.9)` }}
                >
                  {stage.phase}
                </p>
                <ul className="space-y-2.5">
                  {stage.events.map((ev) => (
                    <li key={ev} className="flex items-start gap-2 text-sm text-white">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: `${stage.color}0.8)` }}
                      />
                      {ev}
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* Features grid */}
      <Section bg="alt">
        <SectionHeading title="証明書機能の全体" subtitle="発行・管理・共有・検証まで、ひとつの画面で完結します。" />
        <FeatureGrid className="mt-10">
          {certFeatures.map((f, i) => (
            <FeatureCard key={f.title} title={f.title} description={f.description} delay={i * 40} href={f.href} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="施工後に内容を修正できますか？"
            answer="はい。発行後でも施工内容・写真・担当者などを編集できます。ただし、編集操作は差分付きで編集履歴に保存され、「誰がいつ何を変えたか」が記録されます。ブロックチェーンアンカリングは発行時点のスナップショットに対して行われるため、編集後の証明書と発行時の記録が同時に参照可能です。"
          />
          <FAQItem
            question="1件の証明書に写真は何枚まで添付できますか？"
            answer="1証明書あたり最大20枚の写真を添付できます。ビフォーアフター・工程写真・部位ごとの拡大など、施工品質を伝えるために必要な枚数を登録できます。"
          />
          <FAQItem
            question="証明書のテンプレートを保存できますか？"
            answer="はい。施工種別・使用材料・保証条件などのテンプレートを保存できます。次回以降は選択するだけで主要フィールドが自動入力されます。"
          />
          <FAQItem
            question="発行済みの証明書を削除できますか？"
            answer="完全な削除はできません（監査証跡の保全のため）。誤発行の場合は「無効化」操作で無効ステータスにして、理由を記録します。顧客の画面には「無効化済み」と表示されます。"
          />
          <FAQItem
            question="電子署名法・e-文書法への対応状況は？"
            answer="Ledra の施工証明書は、施工事実の記録・共有を目的とした文書です。電子帳簿保存法・e-文書法への完全準拠については、業種・用途に応じて法務確認のうえご利用ください。詳細は個別にお問い合わせください。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="施工を、証明できる資産に変える。"
        subtitle="30秒で発行できるデジタル施工証明書を、今日から使い始められます。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#certificate"
        trackLocation="digital-certificate-cta"
      />
    </>
  );
}
