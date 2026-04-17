"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";

/* ---------- Types ---------- */

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  unit_price: number | null;
  tax_category: number | null;
  is_active: boolean;
  created_at: string;
};

type MenuItemsData = {
  items: MenuItem[];
  stats: { total: number };
};

/* ---------- Component ---------- */

export default function MenuItemsClient() {
  // SWR for main data
  const { data, error: swrError, isLoading: loading, mutate } = useSWR<MenuItemsData>(
    "/api/admin/menu-items",
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 2000 },
  );

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnitPrice, setFormUnitPrice] = useState("");
  const [formTaxCategory, setFormTaxCategory] = useState("10");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editTaxCategory, setEditTaxCategory] = useState("10");
  const [editSaving, setEditSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // CSV import
  const [showCsv, setShowCsv] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvMsg, setCsvMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- Create ---------- */

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/menu-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDescription.trim() || null,
          unit_price: formUnitPrice ? parseInt(formUnitPrice, 10) : null,
          tax_category: parseInt(formTaxCategory, 10),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      setFormName("");
      setFormDescription("");
      setFormUnitPrice("");
      setFormTaxCategory("10");
      setSaveMsg({ text: `品目「${j.item?.name ?? formName}」を登録しました`, ok: true });
      mutate();
    } catch (e: any) {
      setSaveMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Edit ---------- */

  const startEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditDescription(item.description ?? "");
    setEditUnitPrice(item.unit_price != null ? String(item.unit_price) : "");
    setEditTaxCategory(item.tax_category != null ? String(item.tax_category) : "10");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/menu-items", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          name: editName.trim(),
          description: editDescription.trim() || null,
          unit_price: editUnitPrice ? parseInt(editUnitPrice, 10) : null,
          tax_category: parseInt(editTaxCategory, 10),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setEditingId(null);
      setSaveMsg({ text: "品目を更新しました", ok: true });
      mutate();
    } catch (e: any) {
      alert("更新に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setEditSaving(false);
    }
  };

  /* ---------- Delete (logical) ---------- */

  const handleDelete = async (id: string) => {
    if (!confirm("この品目を無効化しますか？")) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/admin/menu-items", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: "品目を無効化しました", ok: true });
      mutate();
    } catch (e: any) {
      alert("無効化に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- CSV Import ---------- */

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") setCsvText(text);
    };
    reader.readAsText(file);
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) return;
    setCsvImporting(true);
    setCsvMsg(null);
    try {
      const res = await fetch("/api/admin/menu-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "csv_import", csv: csvText }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setCsvText("");
      setCsvMsg({ text: j.message ?? "CSVインポートが完了しました", ok: true });
      if (fileInputRef.current) fileInputRef.current.value = "";
      mutate();
    } catch (e: any) {
      setCsvMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setCsvImporting(false);
    }
  };

  /* ---------- Render ---------- */

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="品目管理"
        title="品目マスタ"
        description="帳票で使用する品目・メニューの管理"
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setShowCsv(!showCsv); setCsvMsg(null); }}
            >
              {showCsv ? "閉じる" : "CSVインポート"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => { setShowForm(!showForm); setSaveMsg(null); }}
            >
              {showForm ? "閉じる" : "新規登録"}
            </button>
          </div>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {data && (
        <>
          {/* Stats */}
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">登録数</div>
              <div className="mt-2 text-2xl font-bold text-primary">{data.stats.total}</div>
              <div className="mt-1 text-xs text-muted">登録品目数</div>
            </div>
          </section>

          {saveMsg && (
            <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>
              {saveMsg.text}
            </div>
          )}

          {/* CSV Import */}
          {showCsv && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">CSV取込</div>
                <div className="mt-1 text-base font-semibold text-primary">CSVインポート</div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted">
                  形式: <code className="text-secondary">品目名,説明,単価,税率区分(10/8)</code>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs px-3 py-1"
                  onClick={() => {
                    const sample = "品目名,説明,単価,税率区分\nガラスコーティング,ボディ全面ガラスコーティング施工,55000,10\nPPFフィルム施工,フロントバンパーPPF貼付,88000,10\nヘッドライトコーティング,ヘッドライト黄ばみ除去+コーティング,15000,10\nインテリアコーティング,本革シートコーティング,35000,10\nホイールコーティング,4本セット,12000,10\nウィンドウフィルム施工,フロント3面,25000,10\n鈑金塗装,バンパー修理塗装,45000,10\n証明書発行手数料,施工証明書の発行,3300,10\nNFCタグ取付,NFCタグ1枚取付,1100,10\n消耗品,コーティング剤等消耗品,2200,10";
                    const blob = new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = "ledra_品目マスタ_見本.csv"; a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  📥 見本CSVダウンロード
                </button>
              </div>
              <div className="space-y-2">
                <textarea
                  className="input-field font-mono text-xs"
                  rows={6}
                  placeholder={"施工証明書発行,施工証明書の発行手数料,5000,10\n軽減税率品目,説明文,3000,8"}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <label className="btn-ghost cursor-pointer text-xs">
                    ファイルを選択
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </label>
                  <span className="text-xs text-muted">またはテキストエリアに直接貼り付け</span>
                </div>
              </div>
              {csvMsg && (
                <div className={`text-sm ${csvMsg.ok ? "text-success" : "text-danger"}`}>
                  {csvMsg.text}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={csvImporting || !csvText.trim()}
                  onClick={handleCsvImport}
                >
                  {csvImporting ? "インポート中…" : "インポート"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setShowCsv(false); setCsvText(""); setCsvMsg(null); }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Create Form */}
          {showForm && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規登録</div>
                <div className="mt-1 text-base font-semibold text-primary">新規品目登録</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted">
                    品目名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例: 施工証明書発行"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">説明</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="品目の説明（任意）"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">単価</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    placeholder="0"
                    value={formUnitPrice}
                    onChange={(e) => setFormUnitPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">税率区分</label>
                  <select
                    className="select-field"
                    value={formTaxCategory}
                    onChange={(e) => setFormTaxCategory(e.target.value)}
                  >
                    <option value="10">10%（標準税率）</option>
                    <option value="8">8%（軽減税率）</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={saving || !formName.trim()}
                  onClick={handleCreate}
                >
                  {saving ? "登録中…" : "登録"}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => { setShowForm(false); }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Items List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">品目一覧</div>
              <div className="mt-1 text-base font-semibold text-primary">品目一覧</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">品目名</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">説明</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">単価</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">税率</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">状態</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {(data.items ?? []).map((item) => (
                    <tr key={item.id} className="hover:bg-surface-hover/60">
                      {editingId === item.id ? (
                        /* Inline Edit Row */
                        <>
                          <td className="px-5 py-3">
                            <input
                              type="text"
                              className="input-field py-1 text-sm"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                            />
                          </td>
                          <td className="hidden sm:table-cell px-5 py-3">
                            <input
                              type="text"
                              className="input-field py-1 text-sm"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                            />
                          </td>
                          <td className="px-5 py-3">
                            <input
                              type="number"
                              className="input-field py-1 text-sm"
                              min="0"
                              value={editUnitPrice}
                              onChange={(e) => setEditUnitPrice(e.target.value)}
                            />
                          </td>
                          <td className="hidden sm:table-cell px-5 py-3">
                            <select
                              className="select-field py-1 text-sm"
                              value={editTaxCategory}
                              onChange={(e) => setEditTaxCategory(e.target.value)}
                            >
                              <option value="10">10%</option>
                              <option value="8">8%</option>
                            </select>
                          </td>
                          <td className="hidden sm:table-cell px-5 py-3">
                            <Badge variant={item.is_active ? "success" : "default"}>
                              {item.is_active ? "有効" : "無効"}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn-primary px-3 py-1 text-xs"
                                disabled={editSaving || !editName.trim()}
                                onClick={handleEdit}
                              >
                                {editSaving ? "保存中…" : "保存"}
                              </button>
                              <button
                                type="button"
                                className="btn-ghost px-3 py-1 text-xs"
                                onClick={cancelEdit}
                              >
                                取消
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        /* Display Row */
                        <>
                          <td className="px-5 py-3.5 font-medium text-primary">{item.name}</td>
                          <td className="hidden sm:table-cell px-5 py-3.5 text-secondary">{item.description ?? "-"}</td>
                          <td className="px-5 py-3.5 font-medium text-primary whitespace-nowrap">
                            {item.unit_price != null ? formatJpy(item.unit_price) : "-"}
                          </td>
                          <td className="hidden sm:table-cell px-5 py-3.5 text-secondary">
                            {item.tax_category != null ? `${item.tax_category}%` : "-"}
                          </td>
                          <td className="hidden sm:table-cell px-5 py-3.5">
                            <Badge variant={item.is_active ? "success" : "default"}>
                              {item.is_active ? "有効" : "無効"}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn-ghost px-3 py-1 text-xs"
                                onClick={() => startEdit(item)}
                              >
                                編集
                              </button>
                              {item.is_active && (
                                <button
                                  type="button"
                                  className="btn-danger px-3 py-1 text-xs"
                                  disabled={deletingId === item.id}
                                  onClick={() => handleDelete(item.id)}
                                >
                                  {deletingId === item.id ? "無効化中…" : "無効化"}
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {(data.items ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-muted">
                        品目が登録されていません
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
  );
}
