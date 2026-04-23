"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import {
  AGENT_STATUS_MAP,
  AGENT_APPLICATION_STATUS_MAP,
  SHARED_FILE_DIRECTION_MAP,
  SIGNING_STATUS_MAP,
  getStatusEntry,
} from "@/lib/statusMaps";
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

type Application = {
  id: string;
  application_number: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  industry: string;
  qualifications: string;
  track_record: string;
  documents: { name: string; storage_path: string; content_type: string; file_size: number; url?: string }[];
  status: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type Tab = "agents" | "applications" | "shared_files" | "contracts";

const TABS: { key: Tab; label: string }[] = [
  { key: "agents", label: "代理店一覧" },
  { key: "applications", label: "申請一覧" },
  { key: "shared_files", label: "共有ファイル" },
  { key: "contracts", label: "契約書" },
];

export default function AgentReviewClient() {
  const [tab, setTab] = useState<Tab>("agents");

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 rounded-xl bg-inset p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-surface-solid text-primary shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "agents" && <AgentsTab />}
      {tab === "applications" && <ApplicationsTab />}
      {tab === "shared_files" && <SharedFilesTab />}
      {tab === "contracts" && <ContractsTab />}
    </div>
  );
}

/* ─── Agents Tab (existing) ─── */

function AgentsTab() {
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
        const j = await res.json().catch((): null => null);
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
        const j = await res.json().catch((): null => null);
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
        <span className="text-sm text-muted">{agents.length} 件</span>
      </div>

      {msg && <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>}

      {/* Commission Edit Modal */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)]">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-primary">コミッション設定 — {editingAgent.name}</h3>

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
              <button onClick={updateCommission} disabled={actionBusy === editingAgent.id} className="btn-primary">
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
            <div key={i} className="h-16 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">代理店が登録されていません</div>
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
                    <tr
                      key={a.id}
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                    >
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
                        <button onClick={() => openCommissionEdit(a)} className="text-accent hover:underline text-sm">
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
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(a.created_at)}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          {a.status === "active_pending_review" && (
                            <button
                              onClick={() => updateStatus(a.id, "active")}
                              disabled={actionBusy === a.id}
                              className="rounded-lg border border-success/30 bg-success-dim px-3 py-1 text-xs font-medium text-success-text hover:bg-success/15 disabled:opacity-40"
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
                              className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1 text-xs font-medium text-accent-text hover:bg-accent/15 disabled:opacity-40"
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

/* ─── Applications Tab (new) ─── */

const INDUSTRY_LABELS: Record<string, string> = {
  car_dealer: "自動車販売",
  insurance_agent: "保険代理店",
  body_shop: "ボディーショップ",
  coating_shop: "コーティング専門店",
  car_wash: "洗車・カーケア",
  other: "その他",
};

function ApplicationsTab() {
  const [apps, setApps] = useState<Application[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<Application | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const fetchApps = async () => {
    setLoading(true);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/agent-applications${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setApps(json.applications ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, [filter]);

  const updateAppStatus = async (appId: string, status: string, extra?: Record<string, string>) => {
    setActionBusy(appId);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-applications/${appId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      }
      const labels: Record<string, string> = {
        under_review: "審査中",
        approved: "承認済み",
        rejected: "却下",
      };
      setMsg(`ステータスを「${labels[status] ?? status}」に更新しました`);
      setDetail(null);
      setRejectId(null);
      setRejectReason("");
      fetchApps();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(null);
    }
  };

  const openDetail = async (appId: string) => {
    try {
      const res = await fetch(`/api/admin/agent-applications/${appId}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setDetail(json.application);
    } catch {
      // ignore
    }
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
          <option value="submitted">申請済み</option>
          <option value="under_review">審査中</option>
          <option value="approved">承認済み</option>
          <option value="rejected">却下</option>
        </select>
        <span className="text-sm text-muted">{apps.length} 件</span>
      </div>

      {msg && <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)]">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-primary">申請を却下</h3>
            <div>
              <label className="text-sm text-secondary mb-1 block">
                却下理由 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="input-field w-full"
                rows={4}
                placeholder="却下理由を入力してください"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setRejectId(null);
                  setRejectReason("");
                }}
                className="rounded-xl border border-default bg-surface-solid px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
              >
                キャンセル
              </button>
              <button
                onClick={() => updateAppStatus(rejectId, "rejected", { rejection_reason: rejectReason })}
                disabled={!rejectReason.trim() || actionBusy === rejectId}
                className="btn-danger"
              >
                {actionBusy === rejectId ? "処理中..." : "却下する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] overflow-y-auto">
          <div className="glass-card w-full max-w-2xl m-6 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary">申請詳細 — {detail.application_number}</h3>
              <button onClick={() => setDetail(null)} className="text-muted hover:text-primary text-xl leading-none">
                &times;
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="section-tag mb-1">会社名</p>
                <p className="text-primary">{detail.company_name}</p>
              </div>
              <div>
                <p className="section-tag mb-1">担当者</p>
                <p className="text-primary">{detail.contact_name}</p>
              </div>
              <div>
                <p className="section-tag mb-1">メール</p>
                <p className="text-primary">{detail.email}</p>
              </div>
              <div>
                <p className="section-tag mb-1">電話番号</p>
                <p className="text-primary">{detail.phone}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="section-tag mb-1">住所</p>
                <p className="text-primary">{detail.address}</p>
              </div>
              <div>
                <p className="section-tag mb-1">業種</p>
                <p className="text-primary">{INDUSTRY_LABELS[detail.industry] || detail.industry || "-"}</p>
              </div>
              <div>
                <p className="section-tag mb-1">ステータス</p>
                {(() => {
                  const s = getStatusEntry(AGENT_APPLICATION_STATUS_MAP, detail.status);
                  return <Badge variant={s.variant}>{s.label}</Badge>;
                })()}
              </div>
            </div>

            {detail.qualifications && (
              <div className="text-sm">
                <p className="section-tag mb-1">保有資格・免許</p>
                <p className="text-primary whitespace-pre-wrap">{detail.qualifications}</p>
              </div>
            )}

            {detail.track_record && (
              <div className="text-sm">
                <p className="section-tag mb-1">紹介実績・事業経歴</p>
                <p className="text-primary whitespace-pre-wrap">{detail.track_record}</p>
              </div>
            )}

            {detail.documents && detail.documents.length > 0 && (
              <div className="text-sm">
                <p className="section-tag mb-2">添付書類</p>
                <ul className="space-y-2">
                  {detail.documents.map((doc, i) => (
                    <li key={i} className="flex items-center gap-2 bg-inset rounded-lg px-3 py-2">
                      <span className="flex-1 truncate text-primary">{doc.name}</span>
                      <span className="text-muted text-xs">{(doc.file_size / 1024).toFixed(0)} KB</span>
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline text-xs"
                        >
                          ダウンロード
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                <p className="text-muted mb-1">却下理由</p>
                <p className="text-red-700 whitespace-pre-wrap">{detail.rejection_reason}</p>
              </div>
            )}

            {/* Actions */}
            {(detail.status === "submitted" || detail.status === "under_review") && (
              <div className="flex gap-3 justify-end border-t border-[var(--border-subtle)] pt-4">
                {detail.status === "submitted" && (
                  <button
                    onClick={() => updateAppStatus(detail.id, "under_review")}
                    disabled={actionBusy === detail.id}
                    className="rounded-lg border border-accent/30 bg-accent-dim px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent/15 disabled:opacity-40"
                  >
                    {actionBusy === detail.id ? "処理中..." : "審査開始"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setDetail(null);
                    setRejectId(detail.id);
                  }}
                  className="btn-danger"
                >
                  却下
                </button>
                <button
                  onClick={() => updateAppStatus(detail.id, "approved")}
                  disabled={actionBusy === detail.id}
                  className="btn-primary"
                >
                  {actionBusy === detail.id ? "処理中..." : "承認"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">申請がありません</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">申請番号</th>
                  <th className="p-3 text-left font-semibold text-secondary">会社名</th>
                  <th className="p-3 text-left font-semibold text-secondary">担当者</th>
                  <th className="p-3 text-left font-semibold text-secondary">メール</th>
                  <th className="p-3 text-left font-semibold text-secondary">業種</th>
                  <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
                  <th className="p-3 text-left font-semibold text-secondary">申請日</th>
                  <th className="p-3 text-left font-semibold text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const s = getStatusEntry(AGENT_APPLICATION_STATUS_MAP, app.status);
                  return (
                    <tr
                      key={app.id}
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                    >
                      <td className="p-3 font-mono text-primary">{app.application_number}</td>
                      <td className="p-3 font-medium text-primary">{app.company_name}</td>
                      <td className="p-3 text-primary">{app.contact_name}</td>
                      <td className="p-3 text-muted">{app.email}</td>
                      <td className="p-3 text-primary">{INDUSTRY_LABELS[app.industry] || app.industry || "-"}</td>
                      <td className="p-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(app.created_at)}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button onClick={() => openDetail(app.id)} className="text-accent hover:underline text-xs">
                            詳細
                          </button>
                          {app.status === "submitted" && (
                            <button
                              onClick={() => updateAppStatus(app.id, "under_review")}
                              disabled={actionBusy === app.id}
                              className="rounded-lg border border-accent/30 bg-accent-dim px-3 py-1 text-xs font-medium text-accent-text hover:bg-accent/15 disabled:opacity-40"
                            >
                              審査開始
                            </button>
                          )}
                          {(app.status === "submitted" || app.status === "under_review") && (
                            <>
                              <button
                                onClick={() => updateAppStatus(app.id, "approved")}
                                disabled={actionBusy === app.id}
                                className="rounded-lg border border-success/30 bg-success-dim px-3 py-1 text-xs font-medium text-success-text hover:bg-success/15 disabled:opacity-40"
                              >
                                承認
                              </button>
                              <button
                                onClick={() => {
                                  setRejectId(app.id);
                                  setRejectReason("");
                                }}
                                disabled={actionBusy === app.id}
                                className="rounded-lg border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40"
                              >
                                却下
                              </button>
                            </>
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

/* ─── Shared Files Tab ─── */

type SharedFile = {
  id: string;
  agent_id: string;
  direction: string;
  file_name: string;
  file_size: number;
  file_type: string;
  note: string | null;
  created_at: string;
};

function SharedFilesTab() {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/agents", { cache: "no-store" });
        const json = await res.json();
        if (res.ok) setAgents((json.agents ?? []).map((a: Agent) => ({ id: a.id, name: a.name })));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const fetchFiles = async () => {
    if (!selectedAgent) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-shared-files?agent_id=${selectedAgent}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setFiles(json.files ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [selectedAgent]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAgent) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("agent_id", selectedAgent);
    if (note.trim()) fd.append("note", note.trim());
    try {
      const res = await fetch("/api/admin/agent-shared-files", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch((): null => null);
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      setMsg("アップロードしました");
      setNote("");
      fetchFiles();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("このファイルを削除しますか？")) return;
    try {
      const res = await fetch(`/api/admin/agent-shared-files/${fileId}`, { method: "DELETE" });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
        setMsg("削除しました");
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm text-secondary mb-1 block">代理店を選択</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="rounded-xl border border-default bg-surface-solid px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          >
            <option value="">選択してください</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {msg && <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>}

      {selectedAgent && (
        <div className="glass-card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-primary">ファイルを送信（本部→代理店）</h3>
          <div className="flex gap-3 items-end flex-wrap">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input-field flex-1 min-w-[200px]"
              placeholder="メモ（任意）"
            />
            <label className="btn-primary cursor-pointer text-sm">
              {uploading ? "アップロード中..." : "ファイルを選択"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                onChange={handleUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : files.length === 0 && selectedAgent ? (
        <div className="glass-card p-8 text-center text-muted">ファイルはまだありません</div>
      ) : files.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">ファイル名</th>
                  <th className="p-3 text-left font-semibold text-secondary">方向</th>
                  <th className="p-3 text-left font-semibold text-secondary">サイズ</th>
                  <th className="p-3 text-left font-semibold text-secondary">メモ</th>
                  <th className="p-3 text-left font-semibold text-secondary">日時</th>
                  <th className="p-3 text-left font-semibold text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const d = getStatusEntry(SHARED_FILE_DIRECTION_MAP, f.direction);
                  return (
                    <tr
                      key={f.id}
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                    >
                      <td className="p-3 font-medium text-primary truncate max-w-[200px]">{f.file_name}</td>
                      <td className="p-3">
                        <Badge variant={d.variant}>{d.label}</Badge>
                      </td>
                      <td className="p-3 text-muted">{(f.file_size / 1024).toFixed(0)} KB</td>
                      <td className="p-3 text-muted truncate max-w-[150px]">{f.note || "-"}</td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(f.created_at)}</td>
                      <td className="p-3">
                        <button onClick={() => handleDelete(f.id)} className="text-red-500 hover:text-red-700 text-xs">
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Contracts Tab ─── */

type SigningRequest = {
  id: string;
  agent_id: string;
  template_type: string;
  title: string;
  status: string;
  signer_email: string;
  signer_name: string;
  sent_at: string | null;
  signed_at: string | null;
  signed_pdf_path: string | null;
  created_at: string;
};

const TEMPLATE_TYPES = [
  { value: "agent_contract", label: "代理店契約書" },
  { value: "nda", label: "秘密保持契約（NDA）" },
  { value: "other", label: "その他" },
];

function ContractsTab() {
  const [agents, setAgents] = useState<
    { id: string; name: string; contact_email: string | null; contact_name: string | null }[]
  >([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [contracts, setContracts] = useState<SigningRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    template_type: "agent_contract",
    title: "",
    signer_email: "",
    signer_name: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/agents", { cache: "no-store" });
        const json = await res.json();
        if (res.ok)
          setAgents(
            (json.agents ?? []).map((a: Agent) => ({
              id: a.id,
              name: a.name,
              contact_email: a.contact_email,
              contact_name: a.contact_name,
            })),
          );
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const fetchContracts = async () => {
    if (!selectedAgent) {
      setContracts([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/agent-contracts?agent_id=${selectedAgent}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setContracts(json.contracts ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContracts();
  }, [selectedAgent]);

  const openCreate = () => {
    const agent = agents.find((a) => a.id === selectedAgent);
    setCreateForm({
      template_type: "agent_contract",
      title: "",
      signer_email: agent?.contact_email ?? "",
      signer_name: agent?.contact_name ?? "",
    });
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createForm.title.trim() || !createForm.signer_email.trim() || !createForm.signer_name.trim()) {
      setMsg("タイトル・署名者メール・署名者名は必須です");
      return;
    }
    setCreateBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent_id: selectedAgent, ...createForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.message ?? json?.error ?? `HTTP ${res.status}`);
      setMsg("署名依頼を送信しました");
      setShowCreate(false);
      fetchContracts();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  };

  const handleDownload = async (contractId: string) => {
    try {
      const res = await fetch(`/api/admin/agent-contracts/${contractId}/download`);
      const json = await res.json();
      if (res.ok && json.url) window.open(json.url, "_blank");
    } catch {
      /* ignore */
    }
  };

  const handleAction = async (contractId: string, action: string) => {
    const label = action === "resend" ? "再送" : "キャンセル";
    if (!confirm(`${label}しますか？`)) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-contracts/${contractId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = await res.json().catch((): null => null);
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      setMsg(`${label}しました`);
      fetchContracts();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm text-secondary mb-1 block">代理店を選択</label>
          <select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            className="rounded-xl border border-default bg-surface-solid px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          >
            <option value="">選択してください</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {selectedAgent && (
          <button onClick={openCreate} className="btn-primary text-sm">
            新規署名依頼
          </button>
        )}
      </div>

      {msg && <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)]">
          <div className="glass-card w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-primary">新規署名依頼</h3>
            <div>
              <label className="text-sm text-secondary mb-1 block">テンプレート種別</label>
              <select
                value={createForm.template_type}
                onChange={(e) => setCreateForm((f) => ({ ...f, template_type: e.target.value }))}
                className="input-field w-full"
              >
                {TEMPLATE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                value={createForm.title}
                onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
                className="input-field w-full"
                placeholder="代理店契約書 2026年度"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">
                署名者メール <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={createForm.signer_email}
                onChange={(e) => setCreateForm((f) => ({ ...f, signer_email: e.target.value }))}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">
                署名者名 <span className="text-red-500">*</span>
              </label>
              <input
                value={createForm.signer_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, signer_name: e.target.value }))}
                className="input-field w-full"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-default bg-surface-solid px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
              >
                キャンセル
              </button>
              <button onClick={handleCreate} disabled={createBusy} className="btn-primary">
                {createBusy ? "送信中..." : "署名依頼を送信"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : contracts.length === 0 && selectedAgent ? (
        <div className="glass-card p-8 text-center text-muted">契約書はまだありません</div>
      ) : contracts.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">タイトル</th>
                  <th className="p-3 text-left font-semibold text-secondary">種別</th>
                  <th className="p-3 text-left font-semibold text-secondary">署名者</th>
                  <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
                  <th className="p-3 text-left font-semibold text-secondary">送信日</th>
                  <th className="p-3 text-left font-semibold text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const s = getStatusEntry(SIGNING_STATUS_MAP, c.status);
                  const typeLabel = TEMPLATE_TYPES.find((t) => t.value === c.template_type)?.label ?? c.template_type;
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                    >
                      <td className="p-3 font-medium text-primary">{c.title}</td>
                      <td className="p-3 text-muted">{typeLabel}</td>
                      <td className="p-3">
                        <div className="text-primary">{c.signer_name}</div>
                        <div className="text-xs text-muted">{c.signer_email}</div>
                      </td>
                      <td className="p-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted">
                        {c.sent_at ? formatDateTime(c.sent_at) : "-"}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          {c.status === "signed" && c.signed_pdf_path && (
                            <button
                              onClick={() => handleDownload(c.id)}
                              className="text-accent hover:underline text-xs"
                            >
                              PDF
                            </button>
                          )}
                          {(c.status === "sent" || c.status === "viewed") && (
                            <>
                              <button
                                onClick={() => handleAction(c.id, "resend")}
                                className="text-accent hover:underline text-xs"
                              >
                                再送
                              </button>
                              <button
                                onClick={() => handleAction(c.id, "cancel")}
                                className="text-red-500 hover:underline text-xs"
                              >
                                キャンセル
                              </button>
                            </>
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
      ) : null}
    </div>
  );
}
