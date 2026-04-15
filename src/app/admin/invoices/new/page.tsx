import { redirect } from "next/navigation";

/**
 * /admin/invoices/new
 * ------------------------------------------------------------
 * 請求書の新規作成フロー入口。
 * 従来 `/admin/invoices/new` は `[id]` ルートに捕まって「請求書詳細」画面に
 * 飛んでしまっていたため、このルートで受け、請求・帳票ハブの請求書タブへ
 * `create=1` を付けてリダイレクトする。
 *
 * クエリで渡された `customer_id` / `vehicle_id` / `reservation_id` は
 * そのまま引き継ぎ、InvoicesClient 側で自動入力する。
 */
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    customer_id?: string;
    vehicle_id?: string;
    reservation_id?: string;
  }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  params.set("view", "invoice");
  params.set("create", "1");
  if (sp.customer_id) params.set("customer_id", sp.customer_id);
  if (sp.vehicle_id) params.set("vehicle_id", sp.vehicle_id);
  if (sp.reservation_id) params.set("reservation_id", sp.reservation_id);
  redirect(`/admin/invoices?${params.toString()}`);
}
