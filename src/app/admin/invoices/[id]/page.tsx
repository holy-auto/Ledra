import { redirect } from "next/navigation";

/**
 * 請求書詳細は帳票詳細 (DocumentDetailClient) に統一済み。
 * documents テーブルの doc_type='invoice' 行を扱う実装は
 * /admin/documents/[id] 側の一本化されている。
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/documents/${id}`);
}
