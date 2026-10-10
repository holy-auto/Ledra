import Link from "next/link";

type ProgressItem = {
  id: string;
  label: string;
  done: boolean;
  href?: string;
};

interface SettingsProgressCardProps {
  hasShopName: boolean;
  hasContact: boolean;
  hasAddress: boolean;
  hasLogo: boolean;
  hasInvoiceNumber: boolean;
  hasBankInfo: boolean;
  hasStripeConnect: boolean;
}

/**
 * 店舗設定ページの上部に表示する進捗カード。
 * 「証明書PDFや請求書PDFに自動反映される項目」のうち、
 * 何が埋まっていて何が未入力かを一覧表示する。
 *
 * 必須は店舗名・連絡先のみ。それ以外は推奨扱いにして、
 * 全部完了でも非表示にせず「100% 完了」を称える表示にする。
 */
export default function SettingsProgressCard(props: SettingsProgressCardProps) {
  const items: ProgressItem[] = [
    { id: "shop_name", label: "店舗名", done: props.hasShopName },
    { id: "contact", label: "連絡先（メール / 電話）", done: props.hasContact },
    { id: "address", label: "住所", done: props.hasAddress },
    { id: "logo", label: "店舗ロゴ", done: props.hasLogo, href: "/admin/logo" },
    { id: "invoice_number", label: "インボイス登録番号", done: props.hasInvoiceNumber },
    { id: "bank_info", label: "振込先口座情報", done: props.hasBankInfo },
    { id: "stripe_connect", label: "Stripe Connect 連携", done: props.hasStripeConnect },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  return (
    <section className="glass-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">設定の進捗</div>
          <div className="mt-0.5 text-base font-semibold text-primary">
            {allDone ? "すべて入力済み" : "証明書・請求書に反映される項目"}
          </div>
          <p className="mt-1 text-xs text-muted">
            {allDone
              ? "ロゴ・連絡先・口座情報まで揃っているので、発行する書類もしっかり信頼感のある仕上がりになります。"
              : "未入力でもLedraは使えますが、証明書・請求書の見映えと信頼感を大きく上げる項目です。"}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-primary">
            {doneCount}
            <span className="text-base font-normal text-muted"> / {total}</span>
          </div>
          <div className="text-[11px] text-muted">{pct}% 完了</div>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-surface-active overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            allDone ? "bg-success" : "bg-gradient-to-r from-accent to-violet-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => {
          const content = (
            <span className="flex items-center gap-2 py-1">
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  item.done ? "bg-success text-white" : "border border-border-default bg-surface text-muted"
                }`}
              >
                {item.done ? "✓" : ""}
              </span>
              <span className={`text-xs ${item.done ? "text-muted line-through" : "text-secondary"}`}>
                {item.label}
              </span>
            </span>
          );

          if (!item.done && item.href) {
            return (
              <li key={item.id}>
                <Link href={item.href} className="block rounded-md hover:bg-surface-hover px-1 -mx-1 transition-colors">
                  {content}
                </Link>
              </li>
            );
          }

          return <li key={item.id}>{content}</li>;
        })}
      </ul>
    </section>
  );
}
