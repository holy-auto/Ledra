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
  business_type: string | null;
  corporate_number: string | null;
  address: string | null;
  representative_name: string | null;
  terms_accepted_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  activated_at: string | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active_pending_review: { label: "審査待ち", color: "bg-warning-dim text-warning-text" },
  active: { label: "正式", color: "bg-success-dim text-success-text" },
  suspended: { label: "停止", color: "bg-danger-dim text-danger-text" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-surface-hover text-secondary" };
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

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
      setRejectionReason("");
      setExpandedId(null);
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
          className="select-field max-w-xs"
        >
          <option value="">全てのステータス</option>
          <option value="active_pending_review">審査待ち</option>
          <option value="active">正式</option>
          <option value="suspended">停止</option>
        </select>

        <div className="text-sm text-muted">
          {loading ? "読み込み中..." : `${insurers.length} 件`}
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl border p-3 text-sm ${msg.startsWith("エラー") ? "border-danger/30 bg-danger-dim text-danger-text" : "border-success/30 bg-success-dim text-success-text"}`}>
          {msg}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto glass-card">
        <table className="min-w-full text-sm">
          <thead className="bg-inset">
            <tr>
              <th className="p-3 text-left font-semibold text-secondary">会社名</th>
              <th className="p-3 text-left font-semibold text-secondary">連絡先</th>
              <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
              <th className="p-3 text-left font-semibold text-secondary">申請プラン</th>
              <th className="p-3 text-left font-semibold text-secondary">現行プラン</th>
              <th className="p-3 text-left font-semibold text-secondary">登録元</th>
              <th className="p-3 text-left font-semibold text-secondary">登録日</th>
              <th className="p-3 text-left font-semibold text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            {insurers.map((ins) => (
              <>
                <tr key={ins.id} className="border-t hover:bg-surface-hover">
                  <td className="p-3">
                    <div className="font-medium text-primary">{ins.name}</div>
                    <div className="text-xs text-muted">{ins.contact_person}</div>
                    <button
                      onClick={() => setExpandedId(expandedId === ins.id ? null : ins.id)}
                      className="text-xs text-accent hover:underline mt-0.5"
                    >
                      {expandedId === ins.id ? "詳細を閉じる" : "詳細を開く"}
                    </button>
                  </td>
                  <td className="p-3">
                    <div className="text-primary">{ins.contact_email ?? "-"}</div>
                    <div className="text-xs text-muted">{ins.contact_phone}</div>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={ins.status} />
                  </td>
                  <td className="p-3 text-secondary">{ins.requested_plan ?? "-"}</td>
                  <td className="p-3">
                    <select
                      value={ins.plan_tier ?? ""}
                      onChange={(e) => updateInsurer(ins.id, { plan_tier: e.target.value })}
                      disabled={actionBusy === ins.id}
                      className="select-field !w-auto !px-2 !py-1 !text-xs"
                    >
                      <option value="basic">basic</option>
                      <option value="pro">pro</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </td>
                  <td className="p-3 text-xs text-muted">
                    {ins.signup_source === "self" ? "セルフ" : "手動"}
                  </td>
                  <td className="p-3 whitespace-nowrap text-xs text-secondary">
                    {ins.created_at ? new Date(ins.created_at).toLocaleDateString("ja-JP") : "-"}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      {ins.status === "active_pending_review" && (
                        <button
                          onClick={() => updateInsurer(ins.id, { status: "active" })}
                          disabled={actionBusy === ins.id}
                          className="rounded-lg bg-success px-3 py-1 text-xs font-medium text-white hover:bg-success/90 disabled:opacity-50"
                        >
                          承認
                        </button>
                      )}
                      {ins.status === "suspended" && (
                        <button
                          onClick={() => updateInsurer(ins.id, { status: "active" })}
                          disabled={actionBusy === ins.id}
                          className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                        >
                          復活
                        </button>
                      )}
                      {ins.status !== "suspended" && (
                        <button
                          onClick={() => {
                            if (ins.status === "active_pending_review") {
                              // Show rejection reason input
                              setExpandedId(ins.id);
                            } else {
                              updateInsurer(ins.id, { status: "suspended" });
                            }
                          }}
                          disabled={actionBusy === ins.id}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-danger hover:bg-red-500/20 disabled:opacity-50"
                        >
                          {ins.status === "active_pending_review" ? "却下" : "停止"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expanded detail row */}
                {expandedId === ins.id && (
                  <tr key={`${ins.id}-detail`} className="border-t bg-inset/50">
                    <td colSpan={8} className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-muted mb-0.5">事業形態</div>
                          <div className="text-primary">
                            {ins.business_type === "sole_proprietor" ? "個人事業主" : "法人"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-0.5">法人番号</div>
                          <div className="text-primary">{ins.corporate_number || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-0.5">住所</div>
                          <div className="text-primary">{ins.address || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-0.5">代表者名</div>
                          <div className="text-primary">{ins.representative_name || "-"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-0.5">利用規約同意</div>
                          <div className="text-primary">
                            {ins.terms_accepted_at
                              ? new Date(ins.terms_accepted_at).toLocaleString("ja-JP")
                              : "未同意"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-0.5">審査日</div>
                          <div className="text-primary">
                            {ins.reviewed_at
                              ? new Date(ins.reviewed_at).toLocaleString("ja-JP")
                              : "-"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted mb-0.5">アクティベート日</div>
                          <div className="text-primary">
                            {ins.activated_at
                              ? new Date(ins.activated_at).toLocaleString("ja-JP")
                              : "-"}
                          </div>
                        </div>
                      </div>

                      {/* Rejection reason input for pending insurers */}
                      {ins.status === "active_pending_review" && (
                        <div className="mt-4 border-t pt-4 space-y-2">
                          <label className="text-xs text-secondary">却下理由（停止時に通知メールに含まれます）</label>
                          <textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="却下理由を入力..."
                            className="input-field w-full text-sm"
                            rows={2}
                          />
                          <button
                            onClick={() => updateInsurer(ins.id, {
                              status: "suspended",
                              rejection_reason: rejectionReason || undefined,
                            })}
                            disabled={actionBusy === ins.id}
                            className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            却下して停止する
                          </button>
                        </div>
                      )}

                      {/* Show rejection reason if already rejected */}
                      {ins.rejection_reason && (
                        <div className="mt-4 border-t pt-4">
                          <div className="text-xs text-muted mb-0.5">却下理由</div>
                          <div className="text-sm text-primary bg-red-50 border border-red-200 rounded-lg p-2">
                            {ins.rejection_reason}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!loading && insurers.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-sm text-muted">
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
