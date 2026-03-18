import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

function safeNextPath(value: string | undefined) {
  if (!value) return "/admin/certificates";
  if (!value.startsWith("/admin")) return "/admin/certificates";
  return value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);

  async function signIn(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "");
    const password = String(formData.get("password") || "");

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) redirect(`/login?next=${encodeURIComponent(next)}&e=1`);
    redirect(next);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-base p-6">
      <div className="glass-card w-full max-w-sm space-y-6 p-8">
        {/* Branding */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ background: "linear-gradient(135deg, #0071e3, #5856d6)" }}>
            C
          </div>
          <span className="text-xl font-bold text-primary tracking-wide">CARTRUST</span>
        </div>

        <h1 className="text-xl font-bold text-primary text-center">ログイン</h1>

        {sp.e && (
          <div className="text-sm text-red-400 text-center">
            メールアドレスまたはパスワードが正しくありません。
          </div>
        )}

        <form action={signIn} className="space-y-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="input-field w-full"
            required
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="input-field w-full"
            required
          />
          <button className="btn-primary w-full">ログイン</button>
        </form>

        <div className="text-center space-y-2">
          <Link href="/forgot-password" className="text-xs text-[#0071e3] hover:underline">
            パスワードをお忘れですか？
          </Link>
          <p className="text-sm text-secondary">
            アカウントをお持ちでないですか？{" "}
            <Link href="/signup" className="text-[#0071e3] hover:underline font-medium">
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
