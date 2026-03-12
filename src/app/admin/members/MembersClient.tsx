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

export default function MembersClient() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

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
      setAddMsg(`${j.email} を追加しました`);
      await fetchMembers();
    } catch (e: any) {
      setAddMsg(e?.message ?? String(e));
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
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">メンバー管理</h1>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {err && <div className="rounded border p-3 text-sm text-red-700">{err}</div>}

      {data && (
        <>
          <div className="text-sm">
            プラン: <b>{data.plan_tier}</b> / メンバー: <b>{data.member_count}</b> / 上限: <b>{limitLabel}</b>
          </div>

          {!data.can_add && (
            <div className="rounded border p-3 text-sm bg-amber-50 text-amber-900">
              メンバー上限（{limitLabel}）に達しています。追加するには{" "}
              <Link className="underline" href="/admin/billing">
                プランをアップグレード
              </Link>
              してください。
            </div>
          )}

          {/* 追加フォーム */}
          <div className="rounded border p-4 space-y-2">
            <div className="font-semibold text-sm">メンバーを追加</div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                disabled={!data.can_add || adding}
                className="border rounded px-3 py-2 text-sm flex-1 min-w-[200px] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={!data.can_add || adding || !email.trim()}
                className="border rounded px-4 py-2 text-sm disabled:opacity-50"
              >
                {adding ? "追加中…" : "追加"}
              </button>
            </div>
            {addMsg && <div className="text-sm opacity-80">{addMsg}</div>}
            {!data.can_add && (
              <div className="text-xs text-amber-700">
                上限に達しているため追加できません。
              </div>
            )}
          </div>

          {/* メンバー一覧 */}
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">メールアドレス</th>
                  <th className="text-left p-3">ロール</th>
                  <th className="text-left p-3">追加日</th>
                  <th className="text-left p-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.user_id} className="border-t">
                    <td className="p-3">
                      {m.email ?? "-"}
                      {m.is_self && <span className="ml-2 text-xs opacity-60">（自分）</span>}
                    </td>
                    <td className="p-3">{m.role}</td>
                    <td className="p-3 whitespace-nowrap">
                      {m.created_at ? new Date(m.created_at).toLocaleString("ja-JP") : "-"}
                    </td>
                    <td className="p-3">
                      {m.is_self ? (
                        <span className="text-xs opacity-50">-</span>
                      ) : (
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-800 disabled:opacity-50"
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
                    <td colSpan={4} className="p-6 text-gray-500">メンバーがいません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <Link className="rounded border px-3 py-2 text-sm" href="/admin">
              管理画面に戻る
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
