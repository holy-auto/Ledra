import { Section } from "@/components/marketing/Section";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { FAQList } from "@/components/marketing/FAQList";
import { FAQItem } from "@/components/marketing/FAQItem";
import { CTABanner } from "@/components/marketing/CTABanner";

export const metadata = {
  title: "よくある質問",
  description: "Ledraについてのよくある質問と回答。サービス内容、料金、導入方法など。",
};

export default function FAQPage() {
  return (
    <>
      <Section bg="white">
        <SectionHeading title="よくある質問" subtitle="Ledraに関するよくあるご質問をまとめました。" />

        {/* General */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">サービスについて</h3>
          <FAQList>
            <FAQItem
              question="Ledraとは何ですか？"
              answer="Ledraは、自動車施工（コーティング・フィルム・ラッピング等）の記録をデジタル証明書として発行・管理するSaaSプラットフォームです。施工店、保険会社、代理店の3者をつなぎ、施工品質の可視化と業界の信頼構築を支援します。"
            />
            <FAQItem
              question="どのような施工に対応していますか？"
              answer="ガラスコーティング、ボディコーティング、ペイントプロテクションフィルム（PPF）、カーラッピング、ウインドウフィルム、ボディリペアなど、自動車に関する幅広い施工に対応しています。"
            />
            <FAQItem
              question="証明書はどのように発行しますか？"
              answer="管理画面から車両情報・施工内容・写真を入力し「発行」ボタンを押すだけです。QRコード付きのデジタル証明書が即座に生成され、URLやQRコードで顧客に共有できます。"
            />
            <FAQItem
              question="証明書の改ざんは防げますか？"
              answer="はい。証明書はLedraプラットフォーム上で管理され、発行元の施工店以外は内容を変更できません。保険会社はプラットフォーム経由で真正性を確認できます。"
            />
          </FAQList>
        </div>

        {/* Pricing */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">料金・契約</h3>
          <FAQList>
            <FAQItem
              question="無料プランはありますか？"
              answer="はい。フリープランは期間無制限で月10件まで証明書を発行できます。クレジットカードの登録も不要です。"
            />
            <FAQItem
              question="途中でプラン変更できますか？"
              answer="いつでもアップグレード・ダウングレードが可能です。アップグレード時は日割り差額のみ、ダウングレードは次回更新日から適用されます。"
            />
            <FAQItem
              question="解約に違約金はかかりますか？"
              answer="月額プランの解約に違約金はありません。年間プランは残存期間の返金はございませんが、契約期間中は引き続きご利用いただけます。"
            />
            <FAQItem
              question="支払い方法は？"
              answer="クレジットカード（Visa/Master/Amex/JCB）に対応。年間契約は請求書払いにも対応可能です。"
            />
          </FAQList>
        </div>

        {/* Technical */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">機能・技術</h3>
          <FAQList>
            <FAQItem
              question="スマートフォンから使えますか？"
              answer="はい。Webブラウザからアクセスでき、ホーム画面に追加するとアプリのように利用できます。施工現場でのチェックインや写真撮影にも対応しています。"
            />
            <FAQItem
              question="NFCタグとは何ですか？"
              answer="車両にNFCタグを貼付し、スマートフォンをかざすだけで証明書を表示できる機能です。顧客がいつでも施工証明を確認できるプレミアムな体験を提供します。"
            />
            <FAQItem
              question="他のシステムと連携できますか？"
              answer="Googleカレンダー（予約連携）、Square（売上連携）、Stripe（決済）に対応しています。プロプランではAPI連携も可能です。"
            />
            <FAQItem
              question="データのセキュリティは？"
              answer="全通信はSSL/TLS暗号化。データベースはRow Level Securityで厳密にテナント分離。セキュリティヘッダー（CSP, HSTS等）も適用済みです。"
            />
          </FAQList>
        </div>

        {/* Insurer */}
        <div className="mx-auto mt-12 max-w-3xl">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">保険会社の方</h3>
          <FAQList>
            <FAQItem
              question="保険会社は無料で利用できますか？"
              answer="基本プランから有料となりますが、無料トライアル期間をご用意しています。証明書の検索・照会・案件管理が可能です。"
            />
            <FAQItem
              question="どのように証明書を確認しますか？"
              answer="保険会社専用ポータルから、Public ID・顧客名・車両情報で証明書を検索できます。施工内容・写真・施工店情報を一画面で確認可能です。"
            />
          </FAQList>
        </div>
      </Section>

      <CTABanner />
    </>
  );
}
