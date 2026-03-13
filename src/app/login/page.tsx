import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    <main className="p-6 max-w-sm mx-auto space-y-4">
      <h1 className="text-2xl font-bold">ログイン</h1>

      <form action={signIn} className="space-y-3">
        <input name="email" type="email" placeholder="Email" className="border rounded px-3 py-2 w-full text-sm" required />
        <input name="password" type="password" placeholder="Password" className="border rounded px-3 py-2 w-full text-sm" required />
        <button className="border rounded px-3 py-2 w-full text-sm">ログイン</button>
      </form>

      <p className="text-xs text-gray-500">※ /admin はログイン必須です。</p>
    </main>
  );
}