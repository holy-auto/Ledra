import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import BrandsClient from "./BrandsClient";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/settings/brands");

  // 複数テナント所属時は選択中テナント (active_tenant_id) を使う
  const caller = await resolveCallerWithRole(supabase);
  const membership = caller ? { tenant_id: caller.tenantId } : null;

  if (!membership?.tenant_id) {
    return <div className="p-6 text-sm text-muted">tenant が見つかりません。</div>;
  }

  const { data: brands } = await supabase
    .from("brands")
    .select("*, coating_products(*)")
    .or(`tenant_id.is.null,tenant_id.eq.${membership.tenant_id}`)
    .order("name");

  return (
    <div className="space-y-6">
      <PageHeader
        tag="マスター管理"
        title="ブランド・製品マスター"
        description="コーティング剤のブランドと製品を管理します。証明書作成時に選択できるようになります。"
        actions={
          <Link href="/admin/settings" className="btn-secondary">
            設定に戻る
          </Link>
        }
      />
      <BrandsClient initialBrands={brands ?? []} />
    </div>
  );
}
