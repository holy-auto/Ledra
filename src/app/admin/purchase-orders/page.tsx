import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import dynamic from "next/dynamic";

const PurchaseOrdersClient = dynamic(() => import("./PurchaseOrdersClient"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  ),
});

export const revalidate = 0;

export default async function PurchaseOrdersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/purchase-orders");

  return <PurchaseOrdersClient />;
}
