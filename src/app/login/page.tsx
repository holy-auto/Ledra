import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * ログイン後のリダイレクト先を安全に決定する。
 *
 * - /admin/* は施工店ダッシュボード（常に許可）
 * - /agent/apply は代理店申請ページ（許可）
 * - その他の /agent/* は代理店ポータル（許可）
 * - それ以外は /admin/certificates にフォールバック
 */
function safeNextPath(value: string | undefined) {
  if (!value) return null; // null = コンテキスト判定に委ねる
  if (value.startsWith("/admin")) return value;
  if (value.startsWith("/agent")) return value;
  return null;
}

/**
 * ログイン後のデフォルトリダイレクト先をコンテキストに基づいて決定する。
 * - 施工店のみ → /admin/certificates
 * - 代理店のみ → /agent
 * - 両方 → 前回のアクティブコンテキスト or デフォルト施工店
 * - どちらでもない → /admin/certificates (施工店登録フローへ)
 */
async function resolveDefaultRedirect(userId: string, activeContext: string | null): Promise<string> {
  const admin = getSupabaseAdmin();

  // 施工店メンバーシップ確認
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  const hasShop = !!membership?.tenant_id;

  // 代理店確認
  const { data: agentRecord } = await admin.from("agents").select("id, status").eq("user_id", userId).maybeSingle();

  const hasAgent = !!agentRecord?.id && agentRecord.status === "active";

  if (hasShop && hasAgent) {
    // 両方持っている: 前回のコンテキストまたはデフォルト施工店
    if (activeContext === "agent") return "/agent";
    return "/admin/certificates";
  }

  if (hasAgent) return "/agent";
  return "/admin/certificates";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; redirect_to?: string; e?: string; reason?: string }>;
}) {
  const sp = await searchParams;

  // redirect_to（代理店申請フローなど）と next（既存の施工店フロー）を統合
  const rawNext = sp.redirect_to ?? sp.next;
  const explicitNext = safeNextPath(rawNext);

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");

    const supabase = await createSupabaseServerClient();
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const params = new URLSearchParams();
      if (rawNext) params.set("next", rawNext);
      params.set("e", "1");
      redirect(`/login?${params.toString()}`);
    }

    // 明示的なリダイレクト先が指定されている場合はそちらへ
    if (explicitNext) {
      redirect(explicitNext);
    }

    // コンテキスト判定に基づいてデフォルトのリダイレクト先を決定
    const userId = authData.user?.id;
    if (userId) {
      // active_context Cookie を読む（サーバーアクションでは利用可能）
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const activeContext = cookieStore.get("active_context")?.value ?? null;

      const destination = await resolveDefaultRedirect(userId, activeContext);
      redirect(destination);
    }

    redirect("/admin/certificates");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-sm space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <Image src="/icon-192.png" alt="Ledra" width={40} height={40} className="rounded-lg" priority />
          <span className="text-xl font-bold text-primary tracking-wide">Ledra</span>
        </div>

        <h1 className="text-xl font-bold text-primary text-center">ログイン</h1>

        {sp.reason === "idle" && (
          <div className="text-sm text-amber-500 text-center">
            一定時間操作がなかったため、自動的にログアウトしました。
          </div>
        )}

        {sp.e && (
          <div className="text-sm text-red-400 text-center">メールアドレスまたはパスワードが正しくありません。</div>
        )}

        {/* 代理店申請フローからのリダイレクト時のメッセージ */}
        {rawNext?.startsWith("/agent/apply") && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm text-blue-400">
            施工店アカウントでログインすると、同じメールアドレスで代理店申請ができます。
          </div>
        )}

        <form action={signIn} className="space-y-4">
          <input name="email" type="email" placeholder="Email" className="input-field w-full" required />
          <input name="password" type="password" placeholder="Password" className="input-field w-full" required />
          <button className="btn-primary w-full">ログイン</button>
        </form>

        <div className="text-center space-y-2">
          <Link href="/forgot-password" className="text-xs text-accent hover:underline">
            パスワードをお忘れですか？
          </Link>
          <p className="text-sm text-secondary">
            アカウントをお持ちでないですか？{" "}
            <Link href="/signup" className="text-accent hover:underline font-medium">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
