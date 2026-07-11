import dynamic from "next/dynamic";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import LineKnowledgeOnboardingCard from "./LineKnowledgeOnboardingCard";

const MessagesInboxClient = dynamic(() => import("./MessagesInboxClient"), {
  loading: () => (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  ),
});

export const revalidate = 0;

export const metadata = {
  title: "メッセージ受信箱 | Ledra",
};

/**
 * ナレッジ初回学習カードを出すべきか (サーバー側ゲート)。
 * 編集権限 (admin 以上 = requireMinRole、super_admin 含む) + ナレッジ 0 件のときのみ。
 * テーブル未作成・取得失敗は出さない (fail-soft)。SetupChecklist と同じ
 * 「サーバーで数えて出し分ける」パターン。
 */
async function shouldOfferKnowledgeOnboarding(): Promise<boolean> {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller || !requireMinRole(caller, "admin")) return false;
    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { count, error } = await admin
      .from("tenant_line_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (error) return false;
    return (count ?? 0) === 0;
  } catch {
    return false;
  }
}

export default async function Page() {
  const offerOnboarding = await shouldOfferKnowledgeOnboarding();
  return (
    <div className="space-y-4">
      {offerOnboarding && <LineKnowledgeOnboardingCard />}
      <MessagesInboxClient />
    </div>
  );
}
