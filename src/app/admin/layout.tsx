import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminRouteGuard from "./AdminRouteGuard";
import BillingFetchGuard from "./BillingFetchGuard";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "";

  // Billing page is exempt to prevent redirect loop
  if (!pathname.startsWith("/admin/billing")) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: membership } = await supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (membership?.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("is_active")
          .eq("id", membership.tenant_id)
          .single();

        if (tenant?.is_active === false) {
          const ret = encodeURIComponent(pathname || "/admin");
          redirect(`/admin/billing?reason=inactive&return=${ret}`);
        }
      }
    }
  }

  return (
    <>
      <BillingFetchGuard />
      <Suspense fallback={null}><AdminRouteGuard>{children}</AdminRouteGuard></Suspense>
    </>
  );
}
