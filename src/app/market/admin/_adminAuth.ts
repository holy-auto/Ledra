import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * MARKET_ADMIN_EMAILS 環境変数に含まれるメールアドレスの場合のみ許可
 * カンマ区切りで複数指定可能: admin@example.com,admin2@example.com
 */
export async function requireAdminSession(): Promise<{ email: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) redirect("/market/login");

  const adminEmails = (process.env.MARKET_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase());
  if (!adminEmails.includes(user.email.toLowerCase())) {
    redirect("/market/dashboard");
  }

  return { email: user.email };
}
