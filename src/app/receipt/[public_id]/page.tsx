/**
 * POS レシートの公開ページ。**認証なし**で、推測不能な public_id だけを鍵にする。
 *
 * Apple Tap to Pay 要件 5.10「決済後にレシートを SMS / Email で送れること」のため。
 * モバイルの ReceiptShareDialog がこの URL を送る。
 *
 * **`/r/` ではなく `/receipt/`。** `/r/[short_id]` は本人確認の入庫リンクが
 * 使っており（intakeLinkServer.ts）、同じ階層に別のスラッグ名は置けない
 * （Next.js は「different slug names for the same dynamic path」でビルドを落とす）。
 *
 * **doc_type = 'receipt' 以外は必ず notFound()。**そのガードは findPublicReceipt()
 * （src/lib/receipts/publicReceipt.ts）に1箇所だけ置いてある。ここには書かない。
 * documents には請求書・見積書・発注書も同居しているので、ガードが漏れると
 * public_id が付いた瞬間にそれらが公開される。
 *
 * 出す情報は「領収書として必要な最小限」に留める。顧客の住所・電話は出さない。
 */
import { notFound } from "next/navigation";

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { findPublicReceipt } from "@/lib/receipts/publicReceipt";

export const dynamic = "force-dynamic";

// 公開URLだが検索エンジンには載せない
export const metadata = {
  title: "領収書",
  robots: { index: false, follow: false },
};

type Item = {
  item_type?: "item" | "heading" | "subtotal";
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  amount?: number;
};

/** 画面に出す列だけ。findPublicReceipt() は行全体を返すので、ここで絞る */
type Receipt = {
  tenant_id: string;
  doc_number: string | null;
  issued_at: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  tax_rate: number | null;
  items_json: unknown;
  note: string | null;
};

const yen = (n: number | null | undefined) => `¥${Number(n ?? 0).toLocaleString("ja-JP")}`;

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ public_id: string }>;
}) {
  const { public_id } = await params;
  const publicId = (public_id ?? "").trim();
  if (!publicId) notFound();

  const admin = createServiceRoleAdmin(
    "public receipt page — lookup by public_id, anonymous caller",
  );

  // doc_type='receipt' のガードは findPublicReceipt() の中。**ここには書かない。**
  // 存在しない public_id と「領収書ではない」を区別しない。どちらも 404。
  const doc = (await findPublicReceipt(admin, publicId)) as Receipt | null;
  if (!doc) notFound();

  const { data: tenant } = await admin
    .from("tenants")
    .select("name, address, contact_phone, registration_number")
    .eq("id", doc.tenant_id)
    .maybeSingle();

  const items: Item[] = Array.isArray(doc.items_json) ? (doc.items_json as Item[]) : [];

  return (
    <main className="mx-auto max-w-lg px-5 py-10 text-slate-900">
      <h1 className="text-2xl font-bold">領収書</h1>
      <p className="mt-1 text-sm text-slate-500">
        {doc.doc_number}
        {doc.issued_at ? ` ・ ${doc.issued_at}` : ""}
      </p>

      <section className="mt-8 rounded-xl border border-slate-200 p-5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-600">合計</span>
          <span className="text-3xl font-bold">{yen(doc.total)}</span>
        </div>

        <dl className="mt-4 space-y-1 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">小計</dt>
            <dd>{yen(doc.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">消費税（{doc.tax_rate ?? 10}%）</dt>
            <dd>{yen(doc.tax)}</dd>
          </div>
        </dl>
      </section>

      {items.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-slate-600">明細</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{it.description ?? ""}</span>
                  {typeof it.quantity === "number" && (
                    <span className="text-xs text-slate-500">
                      {it.quantity}
                      {it.unit ?? "点"} × {yen(it.unit_price)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums">{yen(it.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {doc.note && <p className="mt-6 whitespace-pre-wrap text-sm text-slate-600">{doc.note}</p>}

      <a
        href={`/api/receipt/pdf?rid=${encodeURIComponent(publicId)}`}
        className="mt-8 block rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white"
      >
        PDF をダウンロード
      </a>

      {tenant && (
        <footer className="mt-10 border-t border-slate-100 pt-5 text-xs leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-700">{tenant.name}</p>
          {tenant.address && <p>{tenant.address}</p>}
          {tenant.contact_phone && <p>{tenant.contact_phone}</p>}
          {tenant.registration_number && <p>登録番号: {tenant.registration_number}</p>}
        </footer>
      )}
    </main>
  );
}
