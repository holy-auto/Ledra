import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Dealer, DealerUser, DealerSession } from "@/types/market";

/**
 * 現在ログイン中のディーラーセッションを取得する
 * 未認証 or dealer_users 紐付けなし → null
 */
export async function getDealerSession(): Promise<DealerSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();

  const { data: dealerUser } = await admin
    .from("dealer_users")
    .select("*")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!dealerUser) return null;

  const { data: dealer } = await admin
    .from("dealers")
    .select("*")
    .eq("id", dealerUser.dealer_id)
    .single();

  if (!dealer || dealer.status !== "approved") return null;

  return {
    dealer: dealer as Dealer,
    dealerUser: dealerUser as DealerUser,
  };
}

/**
 * ディーラーセッションを要求し、未認証なら redirect
 */
export async function requireDealerSession(): Promise<DealerSession> {
  const session = await getDealerSession();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/market/login");
  }
  return session;
}

/**
 * 招待コードでディーラー情報を取得
 */
export async function getDealerByInviteCode(inviteCode: string): Promise<Dealer | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("dealers")
    .select("*")
    .eq("invite_code", inviteCode)
    .eq("status", "pending")
    .single();
  return (data as Dealer | null) ?? null;
}

/**
 * 招待コードを生成する（管理者が使用）
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 誤読しやすい文字を除外
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => chars[b % chars.length]).join("");
}
