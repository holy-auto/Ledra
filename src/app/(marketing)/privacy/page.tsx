import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/marketing/config";

function Article({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <article className="prose prose-invert max-w-none">{children}</article>
    </div>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-10 text-lg font-bold text-white">{children}</h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-sm leading-relaxed text-white/65">{children}</p>;
}

function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-white/65">
      {children}
    </ul>
  );
}

export default function PrivacyPage() {
  const updated = "2025年4月1日";

  return (
    <Article>
      <h1 className="mb-2 text-3xl font-bold text-white">
        プライバシーポリシー
      </h1>
      <p className="mb-10 text-sm text-white/40">最終更新日：{updated}</p>

      <P>
        {siteConfig.siteName}（以下「当社」）は、お客様の個人情報の保護を重要な責務と認識し、
        個人情報保護法その他の関連法令を遵守の上、以下のとおりプライバシーポリシー（以下「本ポリシー」）を定めます。
      </P>

      <H2>1. 取得する情報</H2>
      <P>当社は以下の情報を取得することがあります。</P>
      <Ul>
        <li>氏名・会社名・部署名・役職</li>
        <li>メールアドレス・電話番号</li>
        <li>車両情報（登録番号、車台番号など）</li>
        <li>施工内容・施工日時</li>
        <li>ログイン情報・利用履歴・IPアドレス・Cookieなどの技術情報</li>
        <li>お問い合わせ時にご提供いただいた情報</li>
      </Ul>

      <H2>2. 利用目的</H2>
      <P>取得した情報は以下の目的で利用します。</P>
      <Ul>
        <li>サービスの提供・運営・改善</li>
        <li>施工証明書の発行・管理・共有</li>
        <li>保険会社への証明書情報の提供（ユーザーが許可した場合）</li>
        <li>お問い合わせへの対応</li>
        <li>サービスに関するご案内・メールマガジンの配信</li>
        <li>利用規約違反・不正行為への対応</li>
        <li>法令に基づく対応</li>
      </Ul>

      <H2>3. 第三者提供</H2>
      <P>
        当社は、以下のいずれかに該当する場合を除き、個人情報を第三者に提供しません。
      </P>
      <Ul>
        <li>ご本人の同意がある場合</li>
        <li>法令に基づく場合</li>
        <li>
          業務委託先（クラウドインフラ事業者等）に必要な範囲で提供する場合
          ※委託先に対しては適切な監督を行います
        </li>
        <li>事業の承継に伴い情報を引き継ぐ場合</li>
      </Ul>

      <H2>4. Cookieの利用</H2>
      <P>
        当社のウェブサイトはCookieを使用しています。Cookieはブラウザの設定で無効化できますが、
        一部の機能が利用できなくなる場合があります。
        アクセス解析にはGoogle Analyticsを利用しており、収集データはGoogleのプライバシーポリシーに従って管理されます。
      </P>

      <H2>5. 安全管理措置</H2>
      <P>
        個人情報への不正アクセス・紛失・破壊・改ざん・漏洩を防止するため、
        適切な技術的・組織的安全管理措置を講じます。
      </P>

      <H2>6. 開示・訂正・削除の請求</H2>
      <P>
        ご本人から個人情報の開示・訂正・利用停止・削除等のご請求があった場合、
        本人確認の上、法令の定めに従って対応します。
        ご請求は下記お問い合わせ先までご連絡ください。
      </P>

      <H2>7. 未成年者について</H2>
      <P>
        本サービスは事業者を対象としており、未成年者を対象としていません。
        18歳未満の方はご利用いただけません。
      </P>

      <H2>8. ポリシーの変更</H2>
      <P>
        本ポリシーは法令の改正やサービス内容の変更に伴い、予告なく改定することがあります。
        改定後のポリシーはウェブサイトへの掲載をもって効力を生じます。
      </P>

      <H2>9. お問い合わせ</H2>
      <P>
        個人情報の取り扱いに関するお問い合わせは、以下までご連絡ください。
        <br />
        メール：
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="font-medium text-blue-400 hover:underline"
        >
          {siteConfig.contactEmail}
        </a>
      </P>
    </Article>
  );
}

export const metadata: Metadata = {
  title: `プライバシーポリシー | ${siteConfig.siteName}`,
  description: "CARTRUSTのプライバシーポリシーです。",
  openGraph: {
    title: `プライバシーポリシー | ${siteConfig.siteName}`,
    description: "CARTRUSTのプライバシーポリシーです。",
    url: `${siteConfig.siteUrl}/privacy`,
  },
  robots: { index: true, follow: false },
};
