"use client";

import { useState } from "react";
import Link from "next/link";
import { siteConfig } from "@/lib/marketing/config";

// ─── データ ───────────────────────────────────────────────────────────────

type FaqItem = { q: string; a: string };

const faqCategories: { label: string; items: FaqItem[] }[] = [
  {
    label: "サービス全般",
    items: [
      {
        q: "CARTRUSTとはどんなサービスですか？",
        a: "CARTRUSTは、車の施工証明書をデジタルで発行・管理・共有できるSaaSプラットフォームです。施工店はスマートフォンから証明書を発行し、QRコードやURLで顧客・保険会社と共有できます。",
      },
      {
        q: "誰でも利用できますか？",
        a: "施工店（個人・法人）および保険会社を対象としています。個人での利用は現在対応していません。",
      },
      {
        q: "スマートフォンから操作できますか？",
        a: "はい。Webブラウザで動作するため、専用アプリのインストールは不要です。iOS・Androidのいずれでも操作できます。",
      },
      {
        q: "データのバックアップはどうなっていますか？",
        a: "証明書データは複数のデータセンターに冗長化して保管しています。万が一の障害時も復旧できる体制を整えています。",
      },
    ],
  },
  {
    label: "施工店向け",
    items: [
      {
        q: "証明書はどのくらいの時間で発行できますか？",
        a: "車両情報・施工内容を入力してボタンを押すだけで、即時発行されます。慣れれば2〜3分で完了します。",
      },
      {
        q: "発行済みの証明書を修正できますか？",
        a: "証明書の信頼性を担保するため、発行後の内容変更はできません。誤りがあった場合は証明書を再発行してください。",
      },
      {
        q: "既存の紙の証明書はどうすればよいですか？",
        a: "既存の紙の証明書はそのまま利用できます。新規発行分からCARTRUSTをご利用いただく形でも問題ありません。",
      },
      {
        q: "フリープランで枚数を超えるとどうなりますか？",
        a: "月の発行上限（10枚）に達すると新規発行ができなくなります。上限を超えて発行したい場合はスタンダード以上のプランへのアップグレードをご検討ください。",
      },
    ],
  },
  {
    label: "保険会社向け",
    items: [
      {
        q: "どのように証明書の真正性を確認できますか？",
        a: "証明書に付属するQRコードをスキャンするか、URLにアクセスすると、CARTRUSTが発行した証明書であることをリアルタイムで検証できます。改ざんされたデータは検知されます。",
      },
      {
        q: "APIで既存システムと連携できますか？",
        a: "プロプランでREST APIをご利用いただけます。証明書データの自動取得・連携が可能です。詳細な仕様はお問い合わせください。",
      },
      {
        q: "どの施工店の証明書でも確認できますか？",
        a: "CARTRUSTを利用している施工店が発行した証明書に限ります。提携施工店の一覧はダッシュボードから確認できます。",
      },
    ],
  },
  {
    label: "料金・支払い",
    items: [
      {
        q: "無料トライアルはありますか？",
        a: "フリープランは期間の制限なく無料でご利用いただけます。スタンダードプランは14日間の無料トライアルをご用意しています。",
      },
      {
        q: "支払い方法を教えてください。",
        a: "クレジットカード（Visa / Mastercard / JCB / American Express）に対応しています。プロプランでは請求書払いもご相談いただけます。",
      },
      {
        q: "途中でプランを変更・解約できますか？",
        a: "はい、マイページからいつでも変更・解約できます。解約後は月末まで現在のプランが継続されます。",
      },
    ],
  },
];

// ─── アコーディオン ───────────────────────────────────────────────────────

function AccordionItem({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-zinc-100 last:border-0">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 py-5 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-zinc-900">{item.q}</span>
        <span
          className={`mt-0.5 flex-shrink-0 text-zinc-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="pb-5 pr-8">
          <p className="text-sm leading-relaxed text-zinc-500">{item.a}</p>
        </div>
      )}
    </div>
  );
}

// ─── ページ本体 ───────────────────────────────────────────────────────────

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState(
    faqCategories[0].label,
  );

  const active = faqCategories.find((c) => c.label === activeCategory)!;

  return (
    <>
      {/* ヘッダー */}
      <section className="bg-white px-6 pb-20 pt-28 text-center">
        <div className="mx-auto max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            FAQ
          </span>
          <h1 className="mt-2 text-4xl font-bold tracking-tight text-zinc-900">
            よくある質問
          </h1>
          <p className="mt-4 text-zinc-500">
            解決しない場合は{" "}
            <Link
              href="/contact"
              className="font-medium text-zinc-700 hover:underline"
            >
              お問い合わせ
            </Link>{" "}
            ください。
          </p>
        </div>
      </section>

      {/* カテゴリ + アコーディオン */}
      <section className="bg-zinc-50 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          {/* カテゴリタブ */}
          <div className="mb-8 flex flex-wrap gap-2">
            {faqCategories.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setActiveCategory(c.label)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  c.label === activeCategory
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* アコーディオン */}
          <div className="rounded-2xl border border-zinc-200 bg-white px-6">
            {active.items.map((item) => (
              <AccordionItem key={item.q} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-white px-6 py-16 text-center">
        <div className="mx-auto max-w-lg">
          <p className="text-zinc-600">
            ご不明な点があれば、お気軽にお問い合わせください。
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/contact"
              className="rounded-full bg-zinc-900 px-7 py-3 text-sm font-medium text-white hover:bg-zinc-700"
            >
              お問い合わせ
            </Link>
            <Link
              href={`mailto:${siteConfig.contactEmail}`}
              className="rounded-full border border-zinc-200 px-7 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {siteConfig.contactEmail}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
