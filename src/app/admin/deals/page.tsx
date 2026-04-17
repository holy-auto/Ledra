import nextDynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

const DealsClient = nextDynamic(() => import("./DealsClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />,
});

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) redirect("/login?next=/admin/deals");

  return <DealsClient />;
}
