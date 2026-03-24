"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { AGENT_STATUS_MAP, AGENT_REFERRAL_STATUS_MAP, getStatusEntry } from "@/lib/statusMaps";
import { formatDateTime, formatJpy } from "@/lib/format";

type Agent = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  default_commission_rate: number;
  commission_type: string;
  default_commission_fixed: number;
  stripe_account_id: string | null;
  stripe_onboarding_done: boolean;
  referral_count: number;
  contracted_count: number;
  total_commission: number;
  created_at: string;
};

export default function AgentReviewClient() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [commissionRate, setCommissionRate] = useState("");
  const [commissionType, setCommissionType] = useState("percentage");
  const [commissionFixed, setCommissionFixed] = useState("");

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/agents${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setAgents(json.agents ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, [filter]);

  const updateStatus = async (agentId: string, status: string) => {
    setActionBusy(agentId);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agents/${agentId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setMsg(`ステータスを ${status} に更新しました`);
      fetchAgents();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const updateCommission = async () => {
    if (!editingAgent) return;
    setActionBusy(editingAgent.id);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        commission_type: commissionType,
      };
      if (commissionType === "percentage") {
        body.default_commission_rate = parseFloat(commissionRate);
      } else {
        body.default_commission_fixed = parseInt(commissionFixed, 10);
      }
      const res = await fetch(`/api/admin/agents/${editingAgent.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setMsg("コミッション設定を更新しました");
      setEditingAgent(null);
      fetchAgents();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const openCommissionEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setCommissionRate(String(agent.default_commission_rate));
    setCommissionType(agent.commission_type);
    setCommissionFixed(String(agent.default_commission_fixed));
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-xl border border-default bg-surface-solid px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
        >
          <option value="">全ステータス</option>
          <option value="active_pending_review">仮登録（審査待ち）</option>
          <option value="active">有効</option>
          <option value="suspended">停止</option>
        </select>
        <span className="text-sm text-muted">
          {agents.length} 件
        </span>
      </div>

      {msg && (
        <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">
          {msg}
        </div>
      )}

      {/* Commission Edit Modal */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)]">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-primary">
              コミッション設定 — {editingAgent.name}
            </h3>

            <div>
              <label className="text-sm text-secondary mb-1 block">報酬タイプ</label>
              <select
                value={commissionType}
                onChange={(e) => setCommissionType(e.target.value)}
                className="input-field w-full"
              >
                <option value="percentage">パーセンテージ（%）</option>
                <option value="fixed">固定金額（円）</option>
              </select>
            </div>

            {commissionType === "percentage" ? (
              <div>
                <label className="text-sm text-secondary mb-1 block">報酬率（%）</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="input-field w-full"
                  placeholder="例: 10.0"
                />
              </div>
            ) : (
              <div>
                <label className="text-sm text-secondary mb-1 block">固定報酬額（円）</label>
                <input
                  type="number"
                  min="0"
                  value={commissionFixed}
                  onChange={(e) => setCommissionFixed(e.target.value)}
                  className="input-field w-full"
                  placeholder="例: 30000"
                />
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setEditingAgent(null)}
                className="rounded-xl border border-default bg-surface-solid px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
              >
                キャンセル
              </button>
              <button
                onClick={updateCommission}
                disabled={actionBusy === editingAgent.id}
                className="btn-primary"
              >
                {actionBusy === editingAgent.id ? "更新中..." : "更新"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-[rgba(0,0,0,0.04)]" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          代理店が登録されていません
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">代理店名</th>
                  <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
                  <th className="p-3 text-left font-semibold text-secondary">連絡先</th>
                  <th className="p-3 text-left font-semibold text-secondary">報酬率</th>
                  <th className="p-3 text-right font-semibold text-secondary">紹介数</th>
                  <th className="p-3 text-right font-semibold text-secondary">契約数</th>
                  <th className="p-3 text-right font-semibold text-secondary">報酬合計</th>
                  <th className="p-3 text-left font-semibold text-secondary">Stripe</th>
                  <th className="p-3 text-left font-semibold text-secondary">登録日</th>
                  <th className="p-3 text-left font-semibold text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const s = getStatusEntry(AGENT_STATUS_MAP, a.status);
                  return (
                    <tr key={a.id} className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]">
                      <td className="p-3">
                        <div className="font-medium text-primary">{a.name}</div>
                        {a.slug && <div className="text-xs font-mono text-muted">{a.slug}</div>}
                      </td>
                      <td className="p-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="text-primary">{a.contact_name || "-"}</div>
                        <div className="text-xs text-muted">{a.contact_email}</div>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => openCommissionEdit(a)}
                          className="text-accent hover:underline text-sm"
                        >
                          {a.commission_type === "percentage"
                            ? `${a.default_commission_rate}%`
                            : formatJpy(a.default_commission_fixed)}
                        </button>
                      </td>
                      <td className="p-3 text-right font-mono text-primary">{a.referral_count}</td>
                      <td className="p-3 text-right font-mono text-primary">{a.contracted_count}</td>
                      <td className="p-3 text-right font-mono text-primary">{formatJpy(a.total_commission)}</td>
                      <td className="p-3">
                        {a.stripe_onboarding_done ? (
                          <Badge variant="success">接続済</Badge>
                        ) : a.stripe_account_id ? (
                          <Badge variant="warning">未完了</Badge>
                        ) : (
                          <Badge variant="default">未設定</Badge>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted">
                        {formatDateTime(a.created_at)}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          {a.status === "active_pending_review" && (
                            <button
                              onClick={() => updateStatus(a.id, "active")}
                              disabled={actionBusy === a.id}
                              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                            >
                              承認
                            </button>
                          )}
                          {a.status === "active" && (
                            <button
                              onClick={() => updateStatus(a.id, "suspended")}
                              disabled={actionBusy === a.id}
                              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
                            >
                              停止
                            </button>
                          )}
                          {a.status === "suspended" && (
                            <button
                              onClick={() => updateStatus(a.id, "active")}
                              disabled={actionBusy === a.id}
                              className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40"
                            >
                              復活
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
