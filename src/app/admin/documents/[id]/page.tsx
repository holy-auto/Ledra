import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import DocumentDetailClient from "./DocumentDetailClient";
import { DOC_TYPES, type DocType } from "@/types/document";
import { createSignedAssetUrl } from "@/lib/signedUrl";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/documents");

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();
  if (!mem) redirect("/login?next=/admin/documents");

  const { data: doc } = await supabase
    .from("documents")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", mem.tenant_id)
    .single();

  if (!doc) notFound();

  // 顧客情報
  let customerName: string | null = null;
  let customerEmail: string | null = null;
  let customerPhone: string | null = null;
  if (doc.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("name, email, phone")
      .eq("id", doc.customer_id)
      .single();
    customerName = cust?.name ?? null;
    customerEmail = cust?.email ?? null;
    customerPhone = cust?.phone ?? null;
  }

  // テナント情報（インボイス・口座情報用）
  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "name, address, contact_email, contact_phone, registration_number, logo_asset_path, company_seal_path, bank_info",
    )
    .eq("id", mem.tenant_id)
    .single();

  // ロゴ・角印は Storage パスで保存されているため、プレビュー表示用に署名付きURLへ変換する。
  // 非表示 (show_logo / show_seal が false) の資産は署名しない — 署名付きURLは
  // client component の props としてブラウザへ渡るため、意図的に隠した角印等が
  // ダウンロード可能になるのを防ぐ (PDF レンダラと同じゲート条件)。
  const [logoUrl, sealUrl] = await Promise.all([
    doc.show_logo && tenant?.logo_asset_path ? createSignedAssetUrl(tenant.logo_asset_path, 3600) : null,
    doc.show_seal && tenant?.company_seal_path ? createSignedAssetUrl(tenant.company_seal_path, 3600) : null,
  ]);

  const docLabel = DOC_TYPES[doc.doc_type as DocType]?.label ?? doc.doc_type;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        tag={docLabel.toUpperCase()}
        title={`${docLabel} ${doc.doc_number}`}
        actions={
          <Link href="/admin/documents" className="btn-ghost text-xs">
            ← 帳票一覧に戻る
          </Link>
        }
      />
      <DocumentDetailClient
        document={doc}
        customerName={customerName}
        customerEmail={customerEmail}
        customerPhone={customerPhone}
        tenant={tenant}
        logoUrl={logoUrl}
        sealUrl={sealUrl}
      />
    </div>
  );
}
