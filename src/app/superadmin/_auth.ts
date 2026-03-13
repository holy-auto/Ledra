import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * CARTRUST スーパー管理者認証
 * MARKET_ADMIN_EMAILS に含まれるメールアドレスのみ許可
 */
export async function requireSuperAdminSession(): Promise<{ email: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) redirect("/market/login");

  const adminEmails = (process.env.MARKET_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes(user.email.toLowerCase())) {
    redirect("/market/dashboard");
  }

  return { email: user.email };
}
