"use client";

import { useEffect, useState, useCallback } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

/* ── Types ── */

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  campaign_type: string;
  bonus_rate: number | null;
  bonus_fixed: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  target_agents: string;
  banner_text: string | null;
  created_at: string;
  updated_at: string;
};

type FormData = {
  title: string;
  description: string;
  campaign_type: string;
  bonus_rate: string;
  bonus_fixed: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  target_agents: string;
  banner_text: string;
};

/* ── Campaign type helpers ── */

const CAMPAIGN_TYPE_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  commission_boost: { label: "コミッション増額", variant: "success" },
  bonus:           { label: "ボーナス",         variant: "info" },
  referral_bonus:  { label: "紹介ボーナス",     variant: "violet" },
  other:           { label: "その他",           variant: "default" },
};

const CAMPAIGN_TYPE_OPTIONS = [
  { value: "commission_boost", label: "コミッション増額" },
  { value: "bonus",            label: "ボーナス" },
  { value: "referral_bonus",   label: "紹介ボーナス" },
  { value: "other",            label: "その他" },
];

const TARGET_AGENTS_OPTIONS = [
  { value: "all",      label: "全代理店" },
  { value: "selected", label: "選択した代理店" },
];

/* ── Helpers ── */

function toLocalDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyForm(): FormData {
  return {
    title: "",
    description: "",
    campaign_type: "commission_boost",
    bonus_rate: "",
    bonus_fixed: "",
    start_date: "",
    end_date: "",
    is_active: true,
    target_agents: "all",
    banner_text: "",
  };
}

/* ── Component ── */

export default function AdminCampaignsClient() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm());

  // delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /* ── Fetch ── */

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agent-campaigns", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setCampaigns(json.campaigns ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  /* ── Flash message ── */

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  /* ── Create / Update ── */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      flash("タイトルを入力してください", false);
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description || null,
        campaign_type: form.campaign_type,
        bonus_rate: form.bonus_rate ? parseFloat(form.bonus_rate) : null,
        bonus_fixed: form.bonus_fixed ? parseFloat(form.bonus_fixed) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active,
        target_agents: form.target_agents,
        banner_text: form.banner_text || null,
      };

      const url = editingId
        ? `/api/admin/agent-campaigns/${editingId}`
        : "/api/admin/agent-campaigns";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }

      flash(editingId ? "更新しました" : "作成しました", true);
      resetForm();
      fetchCampaigns();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), false);
    } finally {
      setBusy(false);
    }
  };

  /* ── Delete ── */

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/agent-campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      flash("削除しました", true);
      setDeleteTarget(null);
      fetchCampaigns();
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e), false);
    } finally {
      setBusy(false);
    }
  };

  /* ── Edit start ── */

  const startEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      title: c.title,
      description: c.description ?? "",
      campaign_type: c.campaign_type,
      bonus_rate: c.bonus_rate != null ? String(c.bonus_rate) : "",
      bonus_fixed: c.bonus_fixed != null ? String(c.bonus_fixed) : "",
      start_date: toLocalDate(c.start_date),
      end_date: toLocalDate(c.end_date),
      is_active: c.is_active,
      target_agents: c.target_agents,
      banner_text: c.banner_text ?? "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ── Reset ── */

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* Flash message */}
      {msg && (
        <div
          className={`rounded-2xl px-4 py-3 text-sm font-medium ${
            msg.ok
              ? "bg-success-dim text-success-text"
              : "bg-danger-dim text-danger-text"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">
          {loading ? "読み込み中..." : `${campaigns.length} 件`}
        </p>
        {!showForm && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 transition-colors"
          >
            新規作成
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border-default bg-white p-6 shadow-sm space-y-4"
        >
          <h3 className="text-base font-semibold text-primary">
            {editingId ? "キャンペーン編集" : "新規キャンペーン"}
          </h3>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              タイトル <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="キャンペーンタイトル"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">説明</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-y"
              placeholder="キャンペーンの説明"
            />
          </div>

          {/* Campaign type + Target agents row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">キャンペーン種別</label>
              <select
                value={form.campaign_type}
                onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {CAMPAIGN_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">対象代理店</label>
              <select
                value={form.target_agents}
                onChange={(e) => setForm({ ...form, target_agents: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {TARGET_AGENTS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bonus rate + Bonus fixed row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">ボーナス率 (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.bonus_rate}
                onChange={(e) => setForm({ ...form, bonus_rate: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="例: 5.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">ボーナス固定額 (円)</label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.bonus_fixed}
                onChange={(e) => setForm({ ...form, bonus_fixed: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                placeholder="例: 10000"
              />
            </div>
          </div>

          {/* Start date + End date row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">開始日</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1">終了日</label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Banner text */}
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">バナーテキスト</label>
            <input
              type="text"
              value={form.banner_text}
              onChange={(e) => setForm({ ...form, banner_text: e.target.value })}
              className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="代理店画面に表示するバナーテキスト"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-border-default text-primary focus:ring-primary"
            />
            <span className="text-secondary">有効（代理店に公開）</span>
          </label>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy ? "処理中..." : editingId ? "更新" : "作成"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-border-default px-5 py-2 text-sm font-medium text-secondary hover:bg-surface-hover transition-colors"
            >
              キャンセル
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-20 rounded-2xl bg-[rgba(0,0,0,0.04)]" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-border-default bg-white p-8 text-center text-sm text-secondary">
          キャンペーンはまだありません
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const typeInfo = CAMPAIGN_TYPE_MAP[c.campaign_type] ?? CAMPAIGN_TYPE_MAP.other;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-border-default bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  {/* Left */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                      {c.is_active ? (
                        <Badge variant="success">有効</Badge>
                      ) : (
                        <Badge variant="default">無効</Badge>
                      )}
                      <h4 className="text-sm font-semibold text-primary truncate">{c.title}</h4>
                    </div>
                    {c.description && (
                      <p className="text-xs text-secondary line-clamp-2 whitespace-pre-wrap">
                        {c.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-[11px] text-tertiary flex-wrap">
                      {(c.bonus_rate != null || c.bonus_fixed != null) && (
                        <span>
                          {c.bonus_rate != null && `${c.bonus_rate}%`}
                          {c.bonus_rate != null && c.bonus_fixed != null && " / "}
                          {c.bonus_fixed != null && `\u00a5${Number(c.bonus_fixed).toLocaleString("ja-JP")}`}
                        </span>
                      )}
                      <span>
                        期間: {c.start_date ? new Date(c.start_date).toLocaleDateString("ja-JP") : "-"}
                        {" ~ "}
                        {c.end_date ? new Date(c.end_date).toLocaleDateString("ja-JP") : "-"}
                      </span>
                      <span>対象: {c.target_agents === "all" ? "全代理店" : "選択"}</span>
                      <span>作成: {formatDateTime(c.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover transition-colors"
                    >
                      編集
                    </button>
                    {deleteTarget === c.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          disabled={busy}
                          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-50"
                        >
                          削除する
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(null)}
                          className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover transition-colors"
                        >
                          戻す
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c.id)}
                        className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-dim transition-colors"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
