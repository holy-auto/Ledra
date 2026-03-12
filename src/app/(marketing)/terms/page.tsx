import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteConfig } from "@/lib/marketing/config";

function Article({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24">
      <article className="prose prose-zinc max-w-none">{children}</article>
    </div>
  );
}

function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-10 text-lg font-bold text-zinc-900">{children}</h2>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-sm leading-relaxed text-zinc-600">{children}</p>;
}

function Ul({ children }: { children: ReactNode }) {
  return (
    <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-600">
      {children}
    </ul>
  );
}

export default function TermsPage() {
  const updated = "2025年4月1日";

  return (
    <Article>
      <h1 className="mb-2 text-3xl font-bold text-zinc-900">利用規約</h1>
      <p className="mb-10 text-sm text-zinc-400">最終更新日：{updated}</p>

      <P>
        本利用規約（以下「本規約」）は、{siteConfig.siteName}（以下「当社」）が提供する
        施工証明プラットフォーム「CARTRUST」（以下「本サービス」）の利用条件を定めるものです。
        本サービスをご利用の前に、必ずお読みください。
      </P>

      <H2>第1条（適用）</H2>
      <P>
        本規約は、ユーザーと当社との間の本サービスの利用に関わる一切の関係に適用されます。
        本サービスを利用することで、ユーザーは本規約に同意したものとみなします。
      </P>

      <H2>第2条（利用登録）</H2>
      <P>
        本サービスへの登録を希望する方は、当社の定める方法で申し込みを行い、当社が承認した時点で登録が完了します。
        以下に該当する場合、当社は登録を拒否することがあります。
      </P>
      <Ul>
        <li>虚偽の情報を申告した場合</li>
        <li>過去に本規約違反により登録を取り消された場合</li>
        <li>その他当社が不適当と判断した場合</li>
      </Ul>

      <H2>第3条（アカウント管理）</H2>
      <P>
        ユーザーは自己の責任においてアカウント情報を管理してください。
        アカウントの不正利用によって生じた損害について、当社は責任を負いません。
        アカウントの第三者への譲渡・貸与は禁止します。
      </P>

      <H2>第4条（禁止事項）</H2>
      <P>ユーザーは以下の行為を行ってはなりません。</P>
      <Ul>
        <li>虚偽の施工情報を含む証明書の発行</li>
        <li>証明書の偽造・改ざん・不正利用</li>
        <li>当社または第三者の知的財産権・プライバシーを侵害する行為</li>
        <li>本サービスの運営を妨害する行為</li>
        <li>不正アクセス・リバースエンジニアリング</li>
        <li>法令・公序良俗に反する行為</li>
        <li>その他当社が不適当と判断する行為</li>
      </Ul>

      <H2>第5条（証明書の効力）</H2>
      <P>
        CARTRUSTが発行する施工証明書は、施工店が入力した情報に基づく記録です。
        当社は証明書に記載された施工の品質・正確性について保証しません。
        証明書の利用に際しては、関係者が適切に判断してください。
      </P>

      <H2>第6条（料金・支払い）</H2>
      <P>
        有料プランの料金は当社が定める料金表に従います。
        支払いが遅延した場合、当社はサービスの提供を停止することがあります。
        既にお支払いいただいた料金は、法令に別段の定めがある場合を除き返金しません。
      </P>

      <H2>第7条（知的財産権）</H2>
      <P>
        本サービスに関する知的財産権はすべて当社または正当な権利者に帰属します。
        本規約による利用許諾は、ユーザーへの知的財産権の移転を意味しません。
      </P>

      <H2>第8条（免責事項）</H2>
      <P>
        当社は本サービスの完全性・正確性・有用性について明示・黙示を問わず保証しません。
        本サービスの利用により生じた損害について、当社の故意または重大な過失による場合を除き、
        当社は責任を負いません。なお、消費者契約法が適用される場合はこの限りではありません。
      </P>

      <H2>第9条（サービスの変更・停止）</H2>
      <P>
        当社は、事前の通知なく本サービスの内容を変更・停止することがあります。
        これによりユーザーに生じた損害について、当社は責任を負いません。
      </P>

      <H2>第10条（規約の変更）</H2>
      <P>
        当社は必要に応じて本規約を変更できます。変更後の規約はウェブサイトへの掲載をもって効力を生じ、
        変更後に本サービスを利用したユーザーは変更に同意したものとみなします。
      </P>

      <H2>第11条（準拠法・管轄）</H2>
      <P>
        本規約の解釈は日本法に準拠します。
        本サービスに関する紛争については、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
      </P>

      <H2>お問い合わせ</H2>
      <P>
        本規約に関するお問い合わせは{" "}
        <a
          href={`mailto:${siteConfig.contactEmail}`}
          className="font-medium text-zinc-700 hover:underline"
        >
          {siteConfig.contactEmail}
        </a>{" "}
        までご連絡ください。
      </P>
    </Article>
  );
}

export const metadata: Metadata = {
  title: `利用規約 | ${siteConfig.siteName}`,
  description: "CARTRUSTの利用規約です。",
  openGraph: {
    title: `利用規約 | ${siteConfig.siteName}`,
    description: "CARTRUSTの利用規約です。",
    url: `${siteConfig.siteUrl}/terms`,
  },
  robots: { index: true, follow: false },
};
