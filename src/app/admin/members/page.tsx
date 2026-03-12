import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

const ROLE_LABELS: Record<string, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
  viewer: "閲覧者",
};

export default async function AdminMembersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/members");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <main className="p-6 text-sm text-neutral-600">tenant が見つかりません。</main>;
  }
  const tenantId = membership.tenant_id as string;
  const myRole = (membership.role as string | null) ?? "member";

  // Fetch all memberships for this tenant
  const { data: memberships, error } = await supabase
    .from("tenant_memberships")
    .select("id,user_id,role,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    return <main className="p-6 text-sm text-red-700">エラー: {error.message}</main>;
  }

  // Fetch user emails via admin client
  const admin = createSupabaseAdminClient();
  const userIds = (memberships ?? []).map((m) => m.user_id).filter(Boolean) as string[];
  const emailMap: Record<string, string> = {};

  if (userIds.length > 0) {
    try {
      // Fetch each user info — Supabase admin API supports listUsers
      const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
      for (const u of usersPage?.users ?? []) {
        if (userIds.includes(u.id)) {
          emailMap[u.id] = u.email ?? u.phone ?? u.id;
        }
      }
    } catch {
      // If admin API fails, fall back to showing user_id
      for (const uid of userIds) {
        emailMap[uid] = uid;
      }
    }
  }

  const rows = memberships ?? [];

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              MEMBERS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">メンバー管理</h1>
              <p className="mt-2 text-sm text-neutral-600">
                テナントに所属するメンバーの一覧です。
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ダッシュボード
          </Link>
        </header>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">MEMBERS</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{rows.length}</div>
            <div className="mt-1 text-xs text-neutral-500">所属メンバー数</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">YOUR ROLE</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">
              {ROLE_LABELS[myRole] ?? myRole}
            </div>
            <div className="mt-1 text-xs text-neutral-500">あなたの権限</div>
          </div>
        </section>

        {/* Member list */}
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-100">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">LIST</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">メンバー一覧</div>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              メンバーが見つかりません。
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {rows.map((m) => {
                const isMe = m.user_id === user.id;
                const email = emailMap[m.user_id ?? ""] ?? m.user_id ?? "-";
                const role = (m.role as string | null) ?? "member";
                return (
                  <div key={m.id} className="flex items-center gap-4 p-5 hover:bg-neutral-50 transition-colors">
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-700 uppercase">
                      {email.charAt(0)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-900 break-all">
                          {email}
                        </span>
                        {isMe && (
                          <span className="rounded-full border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                            あなた
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                        <span>参加日: {fmt(m.created_at)}</span>
                        <span>ID: {String(m.user_id ?? "").slice(0, 8)}…</span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        role === "owner"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : role === "admin"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-neutral-200 bg-neutral-50 text-neutral-600"
                      }`}>
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Info note */}
        <p className="text-xs text-neutral-400 text-center">
          メンバーの追加・削除・ロール変更はシステム管理者にお問い合わせください。
        </p>

      </div>
    </main>
  );
}
