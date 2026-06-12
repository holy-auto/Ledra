"use client";

import { useCallback, useEffect, useState } from "react";
import { formatJpy } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import CustomerRankBadge from "@/components/ui/CustomerRankBadge";

/**
 * CustomerRanksClient
 * ------------------------------------------------------------
 * 顧客ロイヤリティのランク定義を管理する設定画面。
 * - ランク一覧 (rank_order 昇順)
 * - 追加 / 編集 / 削除
 * - 「ランクを再計算」で全顧客の rank_id を一括更新
 */

type BadgeColor = "gray" | "yellow" | "blue" | "purple";

interface RankRule {
  id: string;
  rank_name: string;
  rank_order: number;
  min_visits: number;
  min_total_spend: number;
  badge_color: BadgeColor | string;
  created_at: string;
  updated_at: string;
}

interface FormState {
  rank_name: string;
  rank_order: string;
  min_visits: string;
  min_total_spend: string;
  badge_color: BadgeColor;
}

const BADGE_COLOR_OPTIONS: { value: BadgeColor; label: string }[] = [
  { value: "gray", label: "グレー" },
  { value: "yellow", label: "ゴールド（黄）" },
  { value: "blue", label: "ブルー" },
  { value: "purple", label: "パープル" },
];

const inputCls =
  "w-full text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

const EMPTY_FORM: FormState = {
  rank_name: "",
  rank_order: "",
  min_visits: "0",
  min_total_spend: "0",
  badge_color: "gray",
};

function toForm(r: RankRule): FormState {
  return {
    rank_name: r.rank_name,
    rank_order: String(r.rank_order),
    min_visits: String(r.min_visits),
    min_total_spend: String(r.min_total_spend),
    badge_color: (["gray", "yellow", "blue", "purple"].includes(r.badge_color) ? r.badge_color : "gray") as BadgeColor,
  };
}

export default function CustomerRanksClient() {
  const { toast } = useToast();
  const [ranks, setRanks] = useState<RankRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // editingId: "new" = 新規作成フォーム / uuid = 既存編集 / null = 非表示
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const fetchRanks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/customer-ranks");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setRanks(Array.isArray(data.ranks) ? data.ranks : []);
    } catch {
      toast("ランクの読み込みに失敗しました", "error");
      setRanks([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchRanks();
  }, [fetchRanks]);

  function openNew() {
    setForm({ ...EMPTY_FORM, rank_order: String((ranks[ranks.length - 1]?.rank_order ?? 0) + 1) });
    setEditingId("new");
  }

  function openEdit(r: RankRule) {
    setForm(toForm(r));
    setEditingId(r.id);
  }

  function closeForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function buildPayload() {
    return {
      rank_name: form.rank_name.trim(),
      rank_order: parseInt(form.rank_order, 10),
      min_visits: parseInt(form.min_visits || "0", 10),
      min_total_spend: parseInt(form.min_total_spend || "0", 10),
      badge_color: form.badge_color,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    if (!payload.rank_name) {
      toast("ランク名を入力してください", "error");
      return;
    }
    if (!Number.isFinite(payload.rank_order) || payload.rank_order < 1) {
      toast("表示順は1以上で入力してください", "error");
      return;
    }

    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch("/api/admin/customer-ranks", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? payload : { id: editingId, ...payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "save failed");
      closeForm();
      await fetchRanks();
      toast(isNew ? "ランクを追加しました" : "ランクを更新しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "保存に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/customer-ranks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "delete failed");
      }
      setRanks((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) closeForm();
      toast("ランクを削除しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "削除に失敗しました", "error");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const res = await fetch("/api/admin/customer-ranks/recalculate", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "recalculate failed");
      toast(`${data.updated ?? 0}件の顧客ランクを更新しました`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "再計算に失敗しました", "error");
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">顧客ランク</h1>
          <p className="text-sm text-secondary mt-1">来店回数・累計売上に応じて顧客を自動的にランク分けします</p>
        </div>
        <button
          type="button"
          onClick={handleRecalculate}
          disabled={recalculating}
          className="btn-secondary text-sm px-4 py-2 disabled:opacity-50"
        >
          {recalculating ? "再計算中..." : "ランクを再計算"}
        </button>
      </div>

      <p className="mb-6 text-xs text-muted">
        表示順 1
        が最高ランクです。各顧客には、来店回数・累計売上の両方の条件を満たすランクのうち、最も高いものが割り当てられます。
      </p>

      {loading ? (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="h-8 w-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* ランク一覧 */}
          {ranks.length === 0 ? (
            <div className="glass-card p-8 text-center text-sm text-muted">
              ランクがまだ登録されていません。「+ ランクを追加」から作成してください。
            </div>
          ) : (
            ranks.map((r) => (
              <div key={r.id}>
                <div className="glass-card flex items-center gap-3 p-4">
                  <CustomerRankBadge rank={{ rank_name: r.rank_name, badge_color: r.badge_color }} />
                  <span className="text-[11px] text-muted">#{r.rank_order}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-primary">{r.rank_name}</div>
                    <div className="text-xs text-muted">
                      来店数≥{r.min_visits} ・ 累計売上≥{formatJpy(r.min_total_spend)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="shrink-0 text-xs text-accent hover:underline"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    disabled={deletingId === r.id}
                    className="shrink-0 text-xs text-danger hover:underline disabled:opacity-40"
                  >
                    削除
                  </button>
                </div>

                {/* 既存編集フォーム (インライン) */}
                {editingId === r.id && (
                  <RankForm form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={closeForm} />
                )}
              </div>
            ))
          )}

          {/* 新規追加 */}
          {editingId === "new" ? (
            <RankForm form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={closeForm} isNew />
          ) : (
            <button
              type="button"
              onClick={openNew}
              className="w-full rounded-xl border border-dashed border-border-default py-3 text-sm font-medium text-secondary hover:border-accent hover:text-accent transition-colors"
            >
              + ランクを追加
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ランク編集フォーム ─────────────────────────────────────────────
function RankForm({
  form,
  setForm,
  saving,
  onSave,
  onCancel,
  isNew = false,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  isNew?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-border-default bg-surface p-4 ${isNew ? "" : "mt-2"}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">ランク名</span>
          <input
            type="text"
            value={form.rank_name}
            maxLength={40}
            onChange={(e) => setForm((f) => ({ ...f, rank_name: e.target.value }))}
            className={inputCls}
            placeholder="例: プラチナ"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">表示順（1=最高）</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={form.rank_order}
            onChange={(e) => setForm((f) => ({ ...f, rank_order: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">来店数 ≥</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={form.min_visits}
            onChange={(e) => setForm((f) => ({ ...f, min_visits: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-secondary">累計売上 ≥（円）</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={form.min_total_spend}
            onChange={(e) => setForm((f) => ({ ...f, min_total_spend: e.target.value }))}
            className={inputCls}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-secondary">バッジ色</span>
          <select
            value={form.badge_color}
            onChange={(e) => setForm((f) => ({ ...f, badge_color: e.target.value as BadgeColor }))}
            className={inputCls}
          >
            {BADGE_COLOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {saving ? "保存中..." : isNew ? "追加する" : "更新する"}
        </button>
      </div>
    </div>
  );
}
