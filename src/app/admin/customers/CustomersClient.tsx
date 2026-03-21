"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Pagination from "@/components/ui/Pagination";
import { formatDate } from "@/lib/format";
import { fetcher } from "@/lib/swr";

type Customer = {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  certificates_count: number;
  invoices_count: number;
  created_at: string;
};

type Stats = {
  total: number;
  this_month_new: number;
  linked_certificates: number;
};

type PaginationInfo = {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
};

type CustomersData = {
  customers: Customer[];
  stats: Stats;
  pagination?: PaginationInfo;
};

const emptyForm = {
  name: "",
  name_kana: "",
  email: "",
  phone: "",
  postal_code: "",
  address: "",
  note: "",
};

export default function CustomersClient() {
  // Search & pagination
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 50;

  // Build SWR key
  const swrKey = (() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    if (activeSearch) params.set("q", activeSearch);
    return `/api/admin/customers?${params.toString()}`;
  })();

  const { data, error: swrError, isLoading: loading, mutate } = useSWR<CustomersData>(
    swrKey,
    fetcher,
    { revalidateOnFocus: true, keepPreviousData: true, dedupingInterval: 2000 },
  );

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSearch = () => {
    setActiveSearch(search.trim());
    setPage(1);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setForm({ ...emptyForm });
      setShowForm(false);
      setSaveMsg({ text: "顧客を追加しました", ok: true });
      mutate();
    } catch (e: any) {
      setSaveMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      name_kana: c.name_kana ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      postal_code: c.postal_code ?? "",
      address: c.address ?? "",
      note: c.note ?? "",
    });
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, ...editForm }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setEditingId(null);
      mutate();
    } catch (e: any) {
      alert("更新に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("この顧客を削除しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/customers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      mutate();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="顧客管理"
        title="顧客管理"
        description="顧客情報の登録・編集・検索を行います。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => { setShowForm(!showForm); setSaveMsg(null); }}
          >
            {showForm ? "閉じる" : "新規追加"}
          </button>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {data && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.total}</div>
              <div className="mt-1 text-xs text-muted">総顧客数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">今月</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.this_month_new}</div>
              <div className="mt-1 text-xs text-muted">今月の新規</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">証明書</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.linked_certificates}</div>
              <div className="mt-1 text-xs text-muted">紐付き証明書</div>
            </div>
          </section>

          {/* Search */}
          <section className="glass-card p-5">
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <label className="text-xs text-muted">検索（名前・メール・電話番号）</label>
                <input
                  type="text"
                  placeholder="検索キーワード"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                  className="input-field"
                />
              </div>
              <button type="button" className="btn-secondary" onClick={handleSearch}>検索</button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setSearch(""); setActiveSearch(""); setPage(1); }}
              >
                クリア
              </button>
            </div>
          </section>

          {saveMsg && (
            <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>
              {saveMsg.text}
            </div>
          )}

          {/* Add Form */}
          {showForm && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規登録</div>
                <div className="mt-1 text-base font-semibold text-primary">新規顧客登録</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted">顧客名 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="山田 太郎"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">フリガナ</label>
                  <input
                    type="text"
                    value={form.name_kana}
                    onChange={(e) => setForm({ ...form, name_kana: e.target.value })}
                    className="input-field"
                    placeholder="ヤマダ タロウ"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">メールアドレス</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                    placeholder="example@email.com"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">電話番号</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="input-field"
                    placeholder="090-1234-5678"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">郵便番号</label>
                  <input
                    type="text"
                    value={form.postal_code}
                    onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                    className="input-field"
                    placeholder="123-4567"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">住所</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="input-field"
                    placeholder="東京都渋谷区..."
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">備考</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className="input-field"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !form.name.trim()}
                  onClick={handleAdd}
                >
                  {saving ? "保存中…" : "登録"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setShowForm(false); setForm({ ...emptyForm }); }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Edit Modal */}
          {editingId && (
            <section className="glass-card glow-cyan p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">編集</div>
                <div className="mt-1 text-base font-semibold text-primary">顧客情報を編集</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted">顧客名 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">フリガナ</label>
                  <input
                    type="text"
                    value={editForm.name_kana}
                    onChange={(e) => setEditForm({ ...editForm, name_kana: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">メールアドレス</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">電話番号</label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">郵便番号</label>
                  <input
                    type="text"
                    value={editForm.postal_code}
                    onChange={(e) => setEditForm({ ...editForm, postal_code: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">住所</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">備考</label>
                <textarea
                  value={editForm.note}
                  onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                  className="input-field"
                  rows={2}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={editSaving || !editForm.name.trim()}
                  onClick={handleUpdate}
                >
                  {editSaving ? "更新中…" : "更新"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setEditingId(null)}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Customer List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">顧客一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">顧客名</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">フリガナ</th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">メール</th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">電話番号</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">証明書</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">登録日</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {(data.customers ?? []).map((c) => (
                    <tr key={c.id} className="hover:bg-surface-hover/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="font-medium text-primary hover:text-accent underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell px-5 py-3.5 text-secondary">{c.name_kana ?? "-"}</td>
                      <td className="hidden md:table-cell px-5 py-3.5 text-secondary">{c.email ?? "-"}</td>
                      <td className="hidden md:table-cell px-5 py-3.5 text-secondary">{c.phone ?? "-"}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={c.certificates_count > 0 ? "info" : "default"}>
                          {c.certificates_count}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                        {formatDate(c.created_at)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs"
                            onClick={() => startEdit(c)}
                          >
                            編集
                          </button>
                          <button
                            type="button"
                            className="btn-danger px-3 py-1 text-xs"
                            disabled={
                              deletingId === c.id ||
                              c.certificates_count > 0 ||
                              c.invoices_count > 0
                            }
                            title={
                              c.certificates_count > 0 || c.invoices_count > 0
                                ? "証明書・請求書が紐付いているため削除できません"
                                : ""
                            }
                            onClick={() => handleDelete(c.id)}
                          >
                            {deletingId === c.id ? "削除中…" : "削除"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.customers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-muted">
                        顧客が登録されていません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.pagination && (
              <div className="p-4 border-t border-border-subtle">
                <Pagination
                  page={data.pagination.page}
                  totalPages={data.pagination.total_pages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
