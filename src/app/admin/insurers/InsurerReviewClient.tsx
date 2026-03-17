"use client";

import { useEffect, useState } from "react";

type Insurer = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  status: string;
  plan_tier: string | null;
  requested_plan: string | null;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  signup_source: string | null;
  created_at: string;
  reviewed_at: string | null;
  activated_at: string | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active_pending_review: { label: "審査待ち", color: "bg-amber-100 text-amber-800" },
  active: { label: "正式", color: "bg-green-100 text-green-800" },
  suspended: { label: "停止", color: "bg-red-100 text-red-800" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>
      {s.label}
    </span>
  );
}

export default function InsurerReviewClient() {
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchInsurers = async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/insurers${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setInsurers(json.insurers ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsurers();
  }, [filter]);

  const updateInsurer = async (insurer_id: string, updates: Record<string, any>) => {
    setActionBusy(insurer_id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/insurers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insurer_id, ...updates }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "update failed");
      setMsg(`${json.insurer?.name ?? ""} を更新しました`);
      await fetchInsurers();
    } catch (e: any) {
      setMsg(`エラー: ${e?.message ?? "update failed"}`);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
        >
          <option value="">全てのステータス</option>
          <option value="active_pending_review">審査待ち</option>
          <option value="active">正式</option>
          <option value="suspended">停止</option>
        </select>

        <div className="text-sm text-neutral-500">
          {loading ? "読み込み中..." : `${insurers.length} 件`}
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl border p-3 text-sm ${msg.startsWith("エラー") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
          {msg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="p-3 text-left font-semibold text-neutral-600">会社名</th>
              <th className="p-3 text-left font-semibold text-neutral-600">連絡先</th>
              <th className="p-3 text-left font-semibold text-neutral-600">ステータス</th>
              <th className="p-3 text-left font-semibold text-neutral-600">申請プラン</th>
              <th className="p-3 text-left font-semibold text-neutral-600">現行プラン</th>
              <th className="p-3 text-left font-semibold text-neutral-600">登録元</th>
              <th className="p-3 text-left font-semibold text-neutral-600">登録日</th>
              <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {insurers.map((ins) => (
              <tr key={ins.id} className="border-t hover:bg-neutral-50">
                <td className="p-3">
                  <div className="font-medium text-neutral-900">{ins.name}</div>
                  <div className="text-xs text-neutral-500">{ins.contact_person}</div>
                </td>
                <td className="p-3">
                  <div className="text-neutral-700">{ins.contact_email ?? "-"}</div>
                  <div className="text-xs text-neutral-500">{ins.contact_phone}</div>
                </td>
                <td className="p-3">
                  <StatusBadge status={ins.status} />
                </td>
                <td className="p-3 text-neutral-600">{ins.requested_plan ?? "-"}</td>
                <td className="p-3">
                  <select
                    value={ins.plan_tier ?? ""}
                    onChange={(e) => updateInsurer(ins.id, { plan_tier: e.target.value })}
                    disabled={actionBusy === ins.id}
                    className="rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400 disabled:opacity-50"
                  >
                    <option value="">未設定</option>
                    <option value="basic">basic</option>
                    <option value="standard">standard</option>
                    <option value="pro">pro</option>
                  </select>
                </td>
                <td className="p-3 text-xs text-neutral-500">
                  {ins.signup_source === "self" ? "セルフ" : "手動"}
                </td>
                <td className="p-3 whitespace-nowrap text-xs text-neutral-600">
                  {ins.created_at ? new Date(ins.created_at).toLocaleDateString("ja-JP") : "-"}
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {ins.status === "active_pending_review" && (
                      <button
                        onClick={() => updateInsurer(ins.id, { status: "active" })}
                        disabled={actionBusy === ins.id}
                        className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        承認
                      </button>
                    )}
                    {ins.status === "suspended" && (
                      <button
                        onClick={() => updateInsurer(ins.id, { status: "active" })}
                        disabled={actionBusy === ins.id}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        復活
                      </button>
                    )}
                    {ins.status !== "suspended" && (
                      <button
                        onClick={() => updateInsurer(ins.id, { status: "suspended" })}
                        disabled={actionBusy === ins.id}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        停止
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && insurers.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-sm text-neutral-500">
                  保険会社が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
