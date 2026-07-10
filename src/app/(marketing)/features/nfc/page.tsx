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
  title: "NFC対応・スマホをかざして施工証明",
  description:
    "NFCタグに施工証明書を紐付け。顧客がスマートフォンをかざすだけで、コーティング・PPF・ラッピングの施工履歴を即座に確認できます。",
  alternates: { canonical: "/features/nfc" },
};

const usecases = [
  {
    title: "中古車売買での価値証明",
    desc: "購入希望者がスマホをかざすだけで、いつ誰がコーティングしたか・フィルムが貼られているかが一目でわかります。口頭説明より強い信頼が生まれます。",
  },
  {
    title: "洗車・メンテナンス時の確認",
    desc: "他店での洗車や再施工時に、既存コーティングの種類・施工日・施工店を即確認。作業方針の判断ミスを防ぎます。",
  },
  {
    title: "保険請求時のスムーズな提出",
    desc: "保険会社の担当者がスマホをかざすだけで、施工証明書とその真正性（ブロックチェーン検証済み）を確認できます。",
  },
];

const nfcFlowSteps = [
  {
    step: "1",
    title: "施工完了後に証明書を発行",
    desc: "Ledra の管理画面から施工証明書を発行します。施工内容・写真・施工者・日時が記録され、ブロックチェーンへのアンカリングも自動で始まります。",
  },
  {
    step: "2",
    title: "NFCタグに証明書を書き込む",
    desc: "モバイルアプリまたは管理画面から「NFCに書き込む」を操作。証明書のパブリックURLとメタデータをNFCタグに記録します。一般的なISO 14443 / NTAG216タグで動作します。",
  },
  {
    step: "3",
    title: "タグを車両に貼付",
    desc: "NFCタグをドアの内側・ダッシュボード裏・ルーフライナー等、オーナーが見やすく汚れにくい場所に貼付します。タグ自体は薄く、薬品にも強い素材です。",
  },
  {
    step: "4",
    title: "スマホをかざして即確認",
    desc: "顧客・次のオーナー・保険担当者がNFCタグにスマートフォンをかざすと、施工証明書のページが自動で開きます。アプリのインストールは不要です。",
  },
];

const techCards = [
  {
    title: "アプリ不要・URL直接起動",
    description:
      "NFCタグにはWeb URLを書き込むため、Android / iPhone のどちらでもホームページと同じようにブラウザで証明書が開きます。顧客にアプリのインストールを求める必要がありません。",
  },
  {
    title: "複数の施工履歴を一枚のタグで",
    description:
      "再施工のたびに同じタグを上書きするのではなく、車両パスポートとして複数の証明書が時系列で追記されます。「いつ・どの店で・何をしたか」がすべて残ります。",
  },
  {
    title: "改ざん不可のブロックチェーンと連動",
    description:
      "NFCで開く証明書ページには、Polygon ブロックチェーンによる改ざん検知バッジが表示されます。「本当にその施工店が発行した記録か」を第三者が独立に検証できます。",
  },
  {
    title: "オフラインでも基本情報を表示",
    description:
      "NFCタグには施工内容のサマリーをエンコードすることも可能です。通信状況が悪い駐車場などでも、タグ単体で施工情報を表示できます（オプション）。",
  },
];

const vehiclePassportItems = [
  { date: "2024-03-15", shop: "プレミアムコーティング東京", type: "ガラスコーティング 5年", verified: true },
  { date: "2024-06-02", shop: "フィルムプロ横浜", type: "PPF フルラップ", verified: true },
  { date: "2025-01-20", shop: "プレミアムコーティング東京", type: "コーティング メンテナンス", verified: true },
];

export default function NfcPage() {
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "機能", url: "/features" },
          { name: "NFC対応", url: "/features/nfc" },
        ]}
      />
      <PageHero
        badge="FEATURE › NFC対応"
        title="スマホをかざすだけで、施工の証明。"
        subtitle="NFCタグに施工証明書を紐付け。車を売るとき、洗車するとき、保険請求するとき——かざすだけで施工履歴が開きます。アプリのインストール不要。"
      />

      {/* Use cases */}
      <Section bg="alt">
        <SectionHeading
          title="使われる場面"
          subtitle="施工証明書が『物理的に車と一緒にある』ことで、新しい価値が生まれます。"
        />
        <FeatureGrid className="mt-10">
          {usecases.map((u, i) => (
            <FeatureCard key={u.title} variant="bordered" title={u.title} description={u.desc} delay={i * 70} />
          ))}
        </FeatureGrid>
      </Section>

      {/* How it works */}
      <Section>
        <SectionHeading
          title="NFCタグへの書き込みから確認まで"
          subtitle="施工完了から顧客の確認まで、4ステップで完結します。"
        />
        <div className="mx-auto mt-10 max-w-3xl space-y-4">
          {nfcFlowSteps.map((s, i) => (
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

      {/* Vehicle passport mockup */}
      <Section bg="alt">
        <SectionHeading
          title="車両パスポート：一台の全履歴が一箇所に"
          subtitle="NFCをかざすと開く車両パスポートには、その車のすべての施工記録が時系列で並んでいます。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-xl">
            {/* Phone mockup */}
            <div className="mx-auto w-full max-w-[320px] rounded-[2.5rem] border-[6px] border-white/[0.12] bg-[#0a0a0f] shadow-2xl overflow-hidden">
              <div className="px-5 pt-6 pb-8">
                {/* Status bar mock */}
                <div className="flex justify-between items-center mb-5">
                  <span className="text-[0.625rem] text-white font-medium">9:41</span>
                  <div className="flex gap-1.5 items-center">
                    <div className="w-3 h-1.5 rounded-sm bg-white/40" />
                    <div className="w-1 h-1.5 rounded-sm bg-white/40" />
                    <div className="w-1 h-1.5 rounded-sm bg-white/40" />
                  </div>
                </div>

                {/* Header */}
                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.08] p-4 mb-4">
                  <p className="text-[0.625rem] font-semibold text-blue-300 uppercase tracking-widest">
                    Vehicle Passport
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">トヨタ アルファード</p>
                  <p className="text-[0.688rem] text-white font-mono mt-0.5">品川 300 あ 12-34</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    <p className="text-[0.625rem] text-green-300">Polygon 検証済み</p>
                  </div>
                </div>

                {/* Timeline */}
                <p className="text-[0.625rem] font-semibold text-white uppercase tracking-widest mb-3">施工履歴</p>
                <div className="space-y-3">
                  {vehiclePassportItems.map((item) => (
                    <div key={item.date} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.75rem] font-semibold text-white truncate">{item.type}</p>
                          <p className="text-[0.625rem] text-white mt-0.5 truncate">{item.shop}</p>
                          <p className="text-[0.563rem] text-white mt-0.5 font-mono">{item.date}</p>
                        </div>
                        {item.verified && (
                          <div className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-green-500/10 border border-green-500/20">
                            <svg viewBox="0 0 8 8" className="h-2 w-2 text-green-400" fill="currentColor">
                              <path
                                d="M1 4l2 2 4-4"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                                strokeLinecap="round"
                              />
                            </svg>
                            <span className="text-[0.5rem] text-green-300">証明済</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-white">NFCをかざすと自動で開く車両パスポート（イメージ）</p>
          </div>
        </ScrollReveal>
      </Section>

      {/* Tech cards */}
      <Section>
        <SectionHeading title="設計のポイント" subtitle="使い手を選ばない、実用的なNFC実装です。" />
        <FeatureGrid className="mt-10">
          {techCards.map((c, i) => (
            <FeatureCard key={c.title} title={c.title} description={c.description} delay={i * 50} />
          ))}
        </FeatureGrid>
      </Section>

      {/* Comparison: QR vs NFC */}
      <Section bg="alt">
        <SectionHeading
          title="QRコードとNFCの使い分け"
          subtitle="Ledraは両方に対応しています。目的に応じて使い分けられます。"
        />
        <ScrollReveal variant="fade-up">
          <div className="mx-auto mt-10 max-w-3xl overflow-x-auto rounded-2xl border border-white/[0.08]">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.04]">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white"></th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    QRコード
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-blue-300">
                    NFC
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "確認方法", qr: "カメラで読み取り", nfc: "スマホをかざすだけ" },
                  { label: "印刷物", qr: "証明書PDF・名刺に印刷", nfc: "タグを車に貼付" },
                  { label: "使いやすさ", qr: "どのスマホでも対応", nfc: "NFC対応機種（現代の主要機種）" },
                  { label: "車との一体感", qr: "なし（書類のみ）", nfc: "車そのものに埋め込まれた証明" },
                  { label: "適した場面", qr: "書類での証明・メール共有", nfc: "車を売る・見せる・査定される場面" },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-white/[0.05] bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium text-white">{row.label}</td>
                    <td className="px-5 py-3 text-white">{row.qr}</td>
                    <td className="px-5 py-3 text-blue-300 font-medium">{row.nfc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollReveal>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="よくあるご質問" />
        <FAQList>
          <FAQItem
            question="NFCタグはどこで手に入りますか？"
            answer="NTAG216などの一般的なNFCタグはAmazonや電子パーツショップで1枚50〜200円程度で入手できます。Ledraでは動作確認済みのタグをパートナー経由でご提供する予定です。詳細はお問い合わせください。"
          />
          <FAQItem
            question="iPhoneでも読み取れますか？"
            answer="はい。iPhone 7以降はNFCに対応しています（iOS 14以降は自動でNFCタグを読み取ります）。Androidも多くの機種でNFCをサポートしており、アプリのインストール不要でブラウザが自動起動します。"
          />
          <FAQItem
            question="タグに書き込んだ情報は変更できますか？"
            answer="はい、NFCタグへの書き込みは上書き可能です。再施工時に新しい証明書を追記したり、リンク先を更新したりできます。ただし書き込みには Ledra の管理権限が必要です。"
          />
          <FAQItem
            question="どのプランから使えますか？"
            answer="NFC書き込み機能はStandard以上のプランでご利用いただけます。モバイルアプリからの書き込みにはアプリのインストールが必要です。詳細は料金ページをご参照ください。"
          />
          <FAQItem
            question="タグが破損・紛失した場合はどうなりますか？"
            answer="NFCタグが物理的に破損しても、施工証明書のデータはLedraのクラウドに保存されています。新しいタグに再度書き込むだけで復旧できます。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="施工の証明を、車と一緒に残す。"
        subtitle="NFCタグで施工履歴を車に刻む。顧客が次のオーナーに誇れる、証明書の新しい形です。"
        primaryLabel="無料で試す"
        primaryHref="/signup"
        secondaryLabel="機能一覧に戻る"
        secondaryHref="/features#certificate"
        trackLocation="nfc-cta"
      />
    </>
  );
}
