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
import { SignatureFlowDiagram } from "@/components/marketing/diagrams/SignatureFlowDiagram";

export const metadata = {
  title: "電子署名",
  description:
    "代理店契約・NDAをECDSA P-256ベースの電子署名で締結。郵送・FAX・印鑑なしで、電子署名法準拠の契約を数分で完結させます。",
  alternates: { canonical: "/features/digital-signature" },
};

const problems = [
  {
    title: "契約締結まで1〜2週間かかる",
    desc: "郵送・FAX・押印・返送の往復。代理店との契約や機密保持契約（NDA）のたびに、書類が行き来して始まるまでに時間がかかります。",
  },
  {
    title: "紙の管理・保管コストが積み上がる",
    desc: "締結済み契約書の印刷・スキャン・ファイリング・保管場所の確保。どこかに行方不明になるたびに再発行の依頼が発生します。",
  },
  {
    title: "「本当に本人が署名したか」の確認ができない",
    desc: "印鑑証明がない状況では、紙の署名も代筆のリスクがあります。誰がいつどの環境で署名したかを記録する仕組みが必要です。",
  },
];

const useCases = [
  {
    title: "代理店パートナー契約",
    description:
      "新しい代理店との業務委託契約をLedra上で送付・署名。担当者が離れた場所にいてもブラウザだけで完結します。",
  },
  {
    title: "機密保持契約（NDA）",
    description:
      "商談前のNDA締結をメール1本で完了。相手方に専用アカウントは不要で、URLと本人確認OTPだけで署名できます。",
  },
  {
    title: "利用規約への同意記録",
    description:
      "施工店オーナーの初回登録時の利用規約同意を署名形式で保存。「同意した記憶がない」というトラブルを防ぎます。",
  },
  {
    title: "施工完了確認書",
    description: "施工完了時に顧客から確認署名を取得。PDFと一緒にクラウド保管され、後から検索・ダウンロード可能です。",
  },
];

const techCards = [
  {
    title: "ECDSA P-256（secp256r1）",
    description:
      "NIST推奨の楕円曲線デジタル署名アルゴリズム。RSAより短い鍵長で同等以上の安全性を持ち、ブラウザのWeb Crypto APIでネイティブサポートされています。",
  },
  {
    title: "電子署名法第3条準拠",
    description:
      "本人確認はOTPメール認証で担保し、署名意思の確認フローを実装。電子署名法に基づく「本人が署名した」推定要件を満たす設計です。",
  },
  {
    title: "鍵ローテーション対応",
    description:
      "署名鍵は定期的にローテーションします。古い鍵で生成した署名も、鍵バージョン管理により過去の署名を正しく検証できます。",
  },
  {
    title: "監査ログ",
    description:
      "署名リクエスト送信・閲覧・OTP検証・署名完了の各ステップをタイムスタンプ・IPアドレスとともに記録。法的証拠能力を補強します。",
  },
];

const steps = [
  {
    step: "1",
    title: "ドキュメントをアップロード",
    desc: "PDFを管理画面からアップロードし、署名依頼先のメールアドレスを指定します。",
  },
  {
    step: "2",
    title: "署名依頼メールが自動送信",
    desc: "署名者に専用URLを記載したメールが届きます。Ledraのアカウントを持っていない相手にも送付できます。",
  },
  {
    step: "3",
    title: "内容確認・OTP認証",
    desc: "署名者はブラウザでドキュメントを確認し、メールに届いたワンタイムパスワードを入力して本人確認します。",
  },
  {
    step: "4",
    title: "署名が付与される",
    desc: "ECDSA P-256でサーバーが署名を生成し、PDFのメタデータに付与。署名時刻・IPアドレス・OTP検証結果が監査ログに記録されます。",
  },
  {
    step: "5",
    title: "署名済みPDFを双方に保管",
    desc: "依頼者・署名者の双方に署名済みPDFが届き、Ledra上でいつでもダウンロードできます。",
  },
];

export default function DigitalSignaturePage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "電子署名", url: "/features/digital-signature" },
        ]}
      />
      <PageHero
        badge="FEATURE › 電子署名"
        title="契約の握手を、デジタルで完結させる。"
        subtitle="代理店契約・NDA・確認書をECDSA P-256ベースの電子署名で締結。郵送・FAX・印鑑なしで、数分で契約が完了します。"
      />

      {/* Problem */}
      <Section bg="alt">
        <SectionHeading
          title="紙の契約書が、スピードを奪っている"
          subtitle="デジタルのビジネス判断に、アナログの締結フローがついていけていません。"
        />
        <FeatureGrid className="mt-10">
          {problems.map((p, i) => (
            <FeatureCard key={p.title} variant="bordered" title={p.title} description={p.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Flow diagram */}
      <Section>
        <SectionHeading title="署名フロー" subtitle="依頼から完了まで、最短5分。相手にアカウントは不要です。" />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-8 max-w-5xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 md:p-8">
            <SignatureFlowDiagram className="w-full h-auto" />
          </div>
        </ScrollReveal>
      </Section>

      {/* Step-by-step */}
      <Section bg="alt">
        <SectionHeading title="ステップで見る" subtitle="操作は依頼者・署名者ともにシンプルです。" />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {steps.map((s, i) => (
            <ScrollReveal key={s.step} variant="fade-up" delay={i * 60}>
              <div className="flex items-start gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 md:p-7">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-violet-500/10 text-sm font-bold text-violet-300 border border-violet-500/20">
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

      {/* Use cases */}
      <Section>
        <SectionHeading title="主な利用シーン" subtitle="Ledra上で扱う契約書の種類です。" />
        <FeatureGrid className="mt-10">
          {useCases.map((u, i) => (
            <FeatureCard key={u.title} title={u.title} description={u.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Tech */}
      <Section bg="alt">
        <SectionHeading title="技術的な設計" subtitle="自前実装だからこそ担保できる信頼性について。" />
        <FeatureGrid className="mt-10">
          {techCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="電子署名は法的に有効ですか？"
            answer="日本の電子署名法（電子署名及び認証業務に関する法律）第3条に基づく要件を満たす設計です。本人確認（OTP）・署名意思の確認・記録保持を実装しており、民事訴訟での証拠能力を補強します。ただし、特定の法的行為（公正証書等）には別途対応が必要な場合があります。"
          />
          <FAQItem
            question="署名者にLedraのアカウントは必要ですか？"
            answer="不要です。署名依頼メールに記載されたURLとOTPだけで署名できます。代理店や取引先がLedraを使っていなくても、ブラウザのみで対応可能です。"
          />
          <FAQItem
            question="署名済みの書類はどこに保管されますか？"
            answer="署名済みPDFはLedraのクラウドストレージ（Supabase Storage）に保管され、依頼者・署名者の双方がいつでもダウンロードできます。保管期間はプランによって異なります。"
          />
          <FAQItem
            question="外部の電子署名サービス（DocuSign等）との違いは何ですか？"
            answer="Ledraの電子署名は施工証明書・代理店管理・請求書発行と同一プラットフォームに統合されています。別サービスへのデータ連携が不要で、契約書と施工記録を一元管理できる点が特徴です。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="契約の締結を、今日から数分に。"
        subtitle="郵送・FAXなしで、代理店との契約が完結します。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#verification"
        trackLocation="digital-signature-cta"
      />
    </>
  );
}
