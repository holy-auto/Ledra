import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { NFC_TAG_PRICING } from "@/lib/marketing/pricing";

export const metadata = {
  title: "NFCタグ連携",
  description:
    "CARTRUSTのNFCタグで施工証明書を車両と一体化。スマートフォンをかざすだけで施工履歴を即座に確認できます。",
};

export default function NFCPage() {
  return (
    <>
      <PageHero
        badge="NFC"
        title="NFCタグで、施工証明を車両と一体化"
        subtitle="スマートフォンをかざすだけ。専用アプリ不要で、誰でも施工証明書を即座に確認できます。"
      />

      {/* NFCとは */}
      <Section>
        <SectionHeading
          title="NFCタグとは？"
          subtitle="交通系ICカード（Suica/PASMO）と同じ近距離無線通信技術を使った小型タグです"
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-white/60 leading-relaxed">
              NFCタグを車両に貼り付けるだけで、施工証明書のデジタルリンクが車両と一体化します。
              お客様や保険会社の担当者がスマートフォンをかざすだけで、施工内容・保証期間・施工店情報を即座に確認できます。
              特別なアプリのインストールは一切不要です。
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* 仕組み */}
      <Section bg="alt">
        <SectionHeading
          title="仕組みはとてもシンプル"
          subtitle="3つのステップで、紙の証明書から解放されます"
        />
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "NFCタグを車両に貼付",
                description:
                  "CARTRUST管理画面でNFCタグに証明書のURLを書き込み、車両のフロントガラス裏面やBピラーなどに貼り付けます。",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <path d="M7 7h10v10H7z" />
                    <path d="M11 3v4m0 10v4M3 11h4m10 0h4" />
                  </svg>
                ),
                color: "cyan",
              },
              {
                step: "02",
                title: "スマートフォンをかざす",
                description:
                  "iPhone/Androidを問わず、NFCに対応したスマートフォンであればタグに近づけるだけ。ブラウザが自動的に起動します。",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <path d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                ),
                color: "blue",
              },
              {
                step: "03",
                title: "証明書を即座に確認",
                description:
                  "施工内容・使用材料・保証期間・施工写真・施工店情報がブラウザ上に表示されます。改ざん防止により信頼性を担保。",
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                ),
                color: "violet",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.step} variant="fade-up" delay={i * 120}>
                <div className="relative p-8 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center h-full">
                  <div
                    className={`w-14 h-14 rounded-xl mx-auto flex items-center justify-center ${
                      item.color === "cyan"
                        ? "bg-cyan-500/15 text-cyan-400"
                        : item.color === "blue"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-violet-500/15 text-violet-400"
                    }`}
                  >
                    {item.icon}
                  </div>
                  <div className="mt-2 text-xs text-white/30 font-medium">STEP {item.step}</div>
                  <h3 className="mt-3 text-lg font-bold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm text-white/60 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Connection lines on desktop */}
          <div className="hidden md:flex justify-center items-center gap-4 -mt-[calc(50%+1rem)] mb-[calc(50%-1rem)]">
            {/* Visual connectors are handled by layout proximity */}
          </div>
        </div>
      </Section>

      {/* ペルソナ別メリット */}
      <Section>
        <SectionHeading
          title="それぞれの立場でのメリット"
          subtitle="NFCタグ連携は、すべてのステークホルダーに価値を提供します"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <FeatureCard
            delay={0}
            variant="bordered"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            }
            title="施工店のメリット"
            description="紙の証明書を印刷・手渡しする手間がなくなります。NFCタグを貼るだけで、お客様がいつでも証明書を確認でき、問い合わせも減少します。"
          />
          <FeatureCard
            delay={100}
            variant="bordered"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            }
            title="車両オーナーのメリット"
            description="スマートフォンをかざすだけで施工内容を確認。紙の証明書を探す必要がなく、中古車売却時にもそのまま付加価値として提示できます。"
          />
          <FeatureCard
            delay={200}
            variant="bordered"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
            title="保険会社のメリット"
            description="車両に紐づいたNFCタグから直接証明書を確認。車両の特定と施工履歴の照合が容易になり、査定の精度とスピードが向上します。"
          />
        </div>
      </Section>

      {/* 料金 */}
      <Section bg="alt">
        <SectionHeading
          title="NFCタグ料金"
          subtitle={`初回${NFC_TAG_PRICING.freeAllocation}枚は無料でお届けします`}
        />
        <ScrollReveal variant="fade-up" delay={100}>
          <div className="max-w-lg mx-auto">
            {/* 初回無料 */}
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] p-6 mb-6 text-center">
              <div className="text-2xl font-bold text-cyan-400">
                初回{NFC_TAG_PRICING.freeAllocation}枚 無料
              </div>
              <p className="mt-2 text-sm text-white/60">
                アカウント作成時に{NFC_TAG_PRICING.freeAllocation}枚のNFCタグを無料でお届けします
              </p>
            </div>

            {/* 追加購入パック */}
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.03]">
                    <th className="text-left py-3.5 px-5 font-medium text-white/50">
                      枚数
                    </th>
                    <th className="text-right py-3.5 px-5 font-medium text-white/50">
                      料金（税込）
                    </th>
                    <th className="text-right py-3.5 px-5 font-medium text-white/50">
                      1枚あたり
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {NFC_TAG_PRICING.packs.map((pack) => {
                    const priceNum = parseInt(pack.price.replace(/[¥,]/g, ""));
                    const perUnit = Math.round(priceNum / pack.quantity);
                    return (
                      <tr key={pack.quantity} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-3.5 px-5 text-white font-medium">
                          {pack.quantity}枚パック
                        </td>
                        <td className="py-3.5 px-5 text-right text-white">
                          {pack.price}
                        </td>
                        <td className="py-3.5 px-5 text-right text-white/60">
                          ¥{perUnit.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-white/40 text-center">
              送料無料・追加注文はいつでも可能
            </p>
          </div>
        </ScrollReveal>
      </Section>

      {/* FAQ */}
      <Section>
        <SectionHeading title="NFCタグに関するご質問" />
        <FAQList>
          <FAQItem
            question="NFCタグは剥がれませんか？"
            answer="CARTRUSTのNFCタグは自動車用の高耐久粘着シートを使用しています。フロントガラス裏面やBピラーなど適切な場所に貼り付ければ、通常使用では剥がれることはありません。"
          />
          <FAQItem
            question="NFCタグの内容を書き換えられてしまうことはありますか？"
            answer="CARTRUSTが書き込んだNFCタグはロックされるため、第三者による書き換えはできません。証明書データ自体もサーバー側で改ざん防止されています。"
          />
          <FAQItem
            question="どのスマートフォンで読み取れますか？"
            answer="iPhone 7以降、およびNFC対応のAndroidスマートフォン（2018年以降のほとんどの機種）で読み取り可能です。専用アプリのインストールは不要で、標準のNFC機能でお使いいただけます。"
          />
          <FAQItem
            question="1台の車両に複数のNFCタグを貼れますか？"
            answer="はい、可能です。例えばコーティング証明書とPPF証明書を別々のタグに紐付けるなど、施工種別ごとにタグを分けることもできます。"
          />
          <FAQItem
            question="NFCタグを使わずにサービスを利用できますか？"
            answer="はい。NFCタグの利用は任意です。URL共有やQRコードによる証明書の共有は、すべてのプランでご利用いただけます。NFCタグはより便利に使いたい方向けのオプションです。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="NFCタグ付きで、CARTRUSTを始めましょう"
        subtitle={`アカウント作成で${NFC_TAG_PRICING.freeAllocation}枚のNFCタグを無料プレゼント`}
        primaryLabel="無料で始める"
        primaryHref="/signup"
        secondaryLabel="お問い合わせ"
      />
    </>
  );
}
