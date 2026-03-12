"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Member = {
  user_id: string;
  email: string | null;
  role: string;
  created_at: string | null;
  is_self: boolean;
};

type MembersData = {
  members: Member[];
  plan_tier: string;
  member_count: number;
  member_limit: number | null;
  can_add: boolean;
};

function planLabel(tier?: string | null) {
  switch (tier) {
    case "mini": return "ミニ";
    case "standard": return "スタンダード";
    case "pro": return "プロ";
    default: return tier ?? "-";
  }
}

export default function MembersClient() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/admin/members", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setData(j as MembersData);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchMembers();
      setLoading(false);
    })();
  }, [fetchMembers]);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      }
      setEmail("");
      setAddMsg({ text: `${j.email} を追加しました`, ok: true });
      await fetchMembers();
    } catch (e: any) {
      setAddMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm("このメンバーを削除しますか？")) return;
    setRemovingId(userId);
    try {
      const res = await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await fetchMembers();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setRemovingId(null);
    }
  };

  const limitLabel = data?.member_limit === null ? "無制限" : `${data?.member_limit}人`;

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
                テナントに所属するメンバーの追加・削除を行います。
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

        {loading && (
          <div className="text-sm text-neutral-500">読み込み中…</div>
        )}
        {err && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        )}

        {data && (
          <>
            {/* Stats */}
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PLAN</div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">{planLabel(data.plan_tier)}</div>
                <div className="mt-1 text-xs text-neutral-500">現在のプラン</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">MEMBERS</div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">{data.member_count}</div>
                <div className="mt-1 text-xs text-neutral-500">現在のメンバー数</div>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">LIMIT</div>
                <div className="mt-2 text-2xl font-bold text-neutral-900">{limitLabel}</div>
                <div className="mt-1 text-xs text-neutral-500">メンバー上限</div>
              </div>
            </section>

            {/* Limit warning */}
            {!data.can_add && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
                <div className="text-sm font-semibold text-amber-900">
                  メンバー上限（{limitLabel}）に達しています
                </div>
                <p className="mt-1 text-sm text-amber-800">
                  追加するには{" "}
                  <Link className="font-medium underline" href="/admin/billing">
                    プランをアップグレード
                  </Link>{" "}
                  してください。
                </p>
              </div>
            )}

            {/* Add member form */}
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">ADD MEMBER</div>
                <div className="mt-1 text-base font-semibold text-neutral-900">メンバーを追加</div>
              </div>
              <div className="flex gap-3 items-center flex-wrap">
                <input
                  type="email"
                  placeholder="メールアドレス"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                  disabled={!data.can_add || adding}
                  className="rounded-xl border border-neutral-300 bg-neutral-50 px-4 py-2.5 text-sm flex-1 min-w-[220px] placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!data.can_add || adding || !email.trim()}
                  className="rounded-xl border border-neutral-900 bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
                >
                  {adding ? "追加中…" : "追加"}
                </button>
              </div>
              {addMsg && (
                <div className={`mt-3 text-sm ${addMsg.ok ? "text-emerald-700" : "text-red-700"}`}>
                  {addMsg.text}
                </div>
              )}
              {!data.can_add && (
                <div className="mt-2 text-xs text-amber-600">
                  上限に達しているため追加できません。
                </div>
              )}
            </section>

            {/* Member list */}
            <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-neutral-100 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">MEMBER LIST</div>
                <div className="mt-1 text-base font-semibold text-neutral-900">メンバー一覧</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-neutral-500">メールアドレス</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-neutral-500">ロール</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-neutral-500">追加日</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-neutral-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.members.map((m) => (
                      <tr key={m.user_id} className="hover:bg-neutral-50/60">
                        <td className="px-5 py-3.5">
                          <span className="font-medium text-neutral-900">{m.email ?? "-"}</span>
                          {m.is_self && (
                            <span className="ml-2 inline-flex rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500">
                              自分
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                            {m.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-neutral-600">
                          {m.created_at ? new Date(m.created_at).toLocaleDateString("ja-JP") : "-"}
                        </td>
                        <td className="px-5 py-3.5">
                          {m.is_self ? (
                            <span className="text-xs text-neutral-400">-</span>
                          ) : (
                            <button
                              type="button"
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                              disabled={removingId === m.user_id}
                              onClick={() => handleRemove(m.user_id)}
                            >
                              {removingId === m.user_id ? "削除中…" : "削除"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {data.members.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-neutral-400">
                          メンバーがいません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
