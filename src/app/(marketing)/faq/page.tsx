import { PageHero } from "@/components/marketing/PageHero";
import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";
import { PLANS, ANNUAL_DISCOUNT_PERCENT } from "@/lib/marketing/pricing";

export const metadata = {
  title: "よくあるご質問",
  description: "CARTRUSTに関するよくあるご質問と回答をまとめました。",
};

export default function FAQPage() {
  return (
    <>
      <PageHero
        badge="FAQ"
        title="よくあるご質問"
        subtitle="CARTRUSTに関するご質問をカテゴリ別にまとめました。"
      />

      {/* サービス全般 */}
      <Section>
        <SectionHeading title="サービス全般" />
        <FAQList>
          <FAQItem
            question="CARTRUSTとは何ですか？"
            answer="CARTRUSTは、自動車の施工記録をデジタル証明書として発行・管理できるクラウドプラットフォームです。施工店と保険会社の双方に、業務効率化と信頼性の向上を提供します。"
          />
          <FAQItem
            question="どのような施工に対応していますか？"
            answer="ボディコーティング、ガラスコーティング、プロテクションフィルム（PPF）、ウィンドウフィルム、デントリペアなど、自動車に関する幅広い施工に対応しています。テンプレートのカスタマイズにより、お客様独自の施工種別にも対応可能です。"
          />
          <FAQItem
            question="導入にあたって特別な設備やソフトウェアは必要ですか？"
            answer="いいえ、CARTRUSTはWebブラウザのみで利用できます。特別なソフトウェアのインストールは不要で、インターネット環境があればすぐにご利用開始いただけます。スマートフォンからのアクセスにも対応しています。"
          />
          <FAQItem
            question="データのセキュリティは大丈夫ですか？"
            answer="はい、SSL暗号化通信、データの暗号化保存、定期的なバックアップなど、企業レベルのセキュリティ対策を実施しています。エンタープライズプランでは、IPアドレス制限やアクセスログの詳細管理も可能です。"
          />
        </FAQList>
      </Section>

      {/* 施工店向け */}
      <Section bg="alt">
        <SectionHeading title="施工店の方へ" />
        <FAQList>
          <FAQItem
            question="無料プランでも証明書の発行はできますか？"
            answer={`はい、無料プランでも${PLANS.starter.certLimitShort}まで証明書を発行いただけます。まずは無料プランでお試しいただき、必要に応じてアップグレードをご検討ください。`}
          />
          <FAQItem
            question="証明書のテンプレートはカスタマイズできますか？"
            answer="スタンダードプラン以上で、テンプレートのカスタマイズが可能です。自社のロゴ・カラーの設定、施工項目のカスタマイズなど、御社のニーズに合わせた証明書を作成できます。"
          />
          <FAQItem
            question="複数店舗で利用できますか？"
            answer="はい、複数店舗でのご利用に対応しています。スタンダードプランでは最大5店舗まで、エンタープライズプランでは無制限でご利用いただけます。店舗ごとの発行管理も可能です。"
          />
          <FAQItem
            question="発行した証明書を顧客にどう共有できますか？"
            answer="発行した証明書にはユニークなURLが付与されます。このURLをメール、LINE、SMSなどでお客様に共有できます。QRコードの自動生成にも対応しているため、その場で紙に印刷してお渡しすることも可能です。"
          />
        </FAQList>
      </Section>

      {/* 保険会社向け */}
      <Section>
        <SectionHeading title="保険会社の方へ" />
        <FAQList>
          <FAQItem
            question="保険会社側でアカウント登録は必要ですか？"
            answer="証明書の閲覧のみであればアカウント登録は不要です。URLからそのまま内容を確認できます。検索やエクスポートなどの機能をご利用の場合は、保険会社向けアカウントをご用意しています。"
          />
          <FAQItem
            question="既存のシステムと連携できますか？"
            answer="エンタープライズプランでは、RESTful APIによる連携が可能です。証明書データの取得、検索、Webhook通知など、既存の社内システムとのシームレスな連携を実現します。"
          />
          <FAQItem
            question="証明書データの信頼性はどう担保されていますか？"
            answer="CARTRUSTでは、証明書発行後のデータ改ざんを防止する仕組みを実装しています。発行日時、施工内容、施工店情報などすべての情報が固定され、不正な変更ができない設計になっています。"
          />
          <FAQItem
            question="大量の証明書データを一括で取得できますか？"
            answer="はい、CSV形式での一括エクスポートに対応しています。日付範囲や施工店での絞り込みも可能です。エンタープライズプランではAPI経由でのバッチ取得もご利用いただけます。"
          />
        </FAQList>
      </Section>

      {/* 料金・契約 */}
      <Section bg="alt">
        <SectionHeading title="料金・契約" />
        <FAQList>
          <FAQItem
            question="無料プランから有料プランへの切り替えはいつでもできますか？"
            answer="はい、いつでもアップグレード可能です。無料プランでの発行データもそのまま引き継がれますので、安心してお切り替えいただけます。"
          />
          <FAQItem
            question="年間契約による割引はありますか？"
            answer={`はい、年間契約の場合は月額料金から${ANNUAL_DISCOUNT_PERCENT}%の割引が適用されます。詳しくはお問い合わせください。`}
          />
          <FAQItem
            question="解約手数料はかかりますか？"
            answer="解約手数料は一切かかりません。月額プランの場合、月末まではご利用いただけます。年間プランの場合は残期間分の返金はございませんのでご了承ください。"
          />
          <FAQItem
            question="請求書払いに対応していますか？"
            answer="エンタープライズプランでは請求書払い（月末締め・翌月末払い）に対応しています。スタンダードプランはクレジットカード決済のみとなります。"
          />
        </FAQList>
      </Section>

      <CTABanner
        title="他にもご質問がありましたら"
        subtitle="お気軽にお問い合わせください。専門スタッフがお答えします。"
        primaryLabel="お問い合わせ"
        secondaryLabel="資料請求"
      />
    </>
  );
}
