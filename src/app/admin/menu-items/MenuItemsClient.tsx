"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { Fragment, useRef, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import EmptyStateGuide from "@/components/ui/EmptyStateGuide";
import FirstUseInlineGuide from "@/components/ui/FirstUseInlineGuide";
import { formatJpy } from "@/lib/format";
import AiPriceHint from "./AiPriceHint";
import { fetcher } from "@/lib/swr";
import { enqueueOrFetch } from "@/lib/outbox/enqueueOrFetch";
import { calcSellingPrice } from "@/lib/pricing/margin";
import { calcLaborPrice } from "@/lib/pricing/labor";
import MenuItemPackagesPanel from "./MenuItemPackagesPanel";

/* ---------- Types ---------- */

type MenuItem = {
  id: string;
  name: string;
  item_code: string | null;
  description: string | null;
  unit_price: number | null;
  cost_price: number | null;
  margin_rate: number | null;
  tax_category: number | null;
  estimated_minutes: number | null;
  labor_hours: number | null;
  category_large: string | null;
  category_medium: string | null;
  category_small: string | null;
  is_active: boolean;
  created_at: string;
};

type MenuItemsData = {
  items: MenuItem[];
  stats: { total: number };
  labor_rate_per_hour: number | null;
};

/* ---------- Component ---------- */

export default function MenuItemsClient() {
  // SWR for main data
  const {
    data,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<MenuItemsData>("/api/admin/menu-items", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formItemCode, setFormItemCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnitPrice, setFormUnitPrice] = useState("");
  const [formCostPrice, setFormCostPrice] = useState("");
  const [formMarginRate, setFormMarginRate] = useState("");
  const [formTaxCategory, setFormTaxCategory] = useState("10");
  const [formEstimatedMinutes, setFormEstimatedMinutes] = useState("");
  const [formLaborHours, setFormLaborHours] = useState("");
  const [formCategoryLarge, setFormCategoryLarge] = useState("");
  const [formCategoryMedium, setFormCategoryMedium] = useState("");
  const [formCategorySmall, setFormCategorySmall] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editItemCode, setEditItemCode] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editCostPrice, setEditCostPrice] = useState("");
  const [editMarginRate, setEditMarginRate] = useState("");
  const [editTaxCategory, setEditTaxCategory] = useState("10");
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState("");
  const [editLaborHours, setEditLaborHours] = useState("");
  const [editCategoryLarge, setEditCategoryLarge] = useState("");
  const [editCategoryMedium, setEditCategoryMedium] = useState("");
  const [editCategorySmall, setEditCategorySmall] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // カテゴリ絞り込み（大→中→小）
  const [filterLarge, setFilterLarge] = useState("");
  const [filterMedium, setFilterMedium] = useState("");
  const [filterSmall, setFilterSmall] = useState("");

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 一括無効化: チェックで複数選択
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDisabling, setBulkDisabling] = useState(false);
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // 「このメニューを使うパッケージ」逆引きの展開状態
  const [packagesOpen, setPackagesOpen] = useState<Set<string>>(new Set());
  const togglePackages = (id: string) =>
    setPackagesOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          item_code: formItemCode.trim() || null,
          description: formDescription.trim() || null,
          unit_price: formUnitPrice ? parseInt(formUnitPrice, 10) : 0,
          cost_price: formCostPrice ? parseInt(formCostPrice, 10) : 0,
          margin_rate: formMarginRate === "" ? null : parseFloat(formMarginRate),
          tax_category: parseInt(formTaxCategory, 10),
          estimated_minutes: formEstimatedMinutes === "" ? null : parseInt(formEstimatedMinutes, 10),
          labor_hours: formLaborHours === "" ? null : parseFloat(formLaborHours),
          category_large: formCategoryLarge.trim() || null,
          category_medium: formCategoryMedium.trim() || null,
          category_small: formCategorySmall.trim() || null,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      setFormName("");
      setFormItemCode("");
      setFormDescription("");
      setFormUnitPrice("");
      setFormCostPrice("");
      setFormMarginRate("");
      setFormTaxCategory("10");
      setFormEstimatedMinutes("");
      setFormLaborHours("");
      setFormCategoryLarge("");
      setFormCategoryMedium("");
      setFormCategorySmall("");
      setSaveMsg({ text: `品目「${j.item?.name ?? formName}」を登録しました`, ok: true });
      mutate();
    } catch (e: any) {
      setSaveMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  // 原価・利益率の変更に応じて提供価格を自動算出（手動で単価を変えたら自動上書きしないよう、
  // ユーザーが提供価格欄を直接編集したことは追跡しない＝シンプルに常に再計算）
  // 原価・利益率の片方が空のときは単価を自動算出しない（0 が勝手に入って入力しにくくなるのを防ぐ）
  const handleFormCostChange = (v: string) => {
    setFormCostPrice(v);
    if (v !== "" && formMarginRate !== "") {
      const cost = parseInt(v, 10) || 0;
      const margin = parseFloat(formMarginRate);
      setFormUnitPrice(String(calcSellingPrice(cost, margin)));
    }
  };
  const handleFormMarginChange = (v: string) => {
    setFormMarginRate(v);
    if (formCostPrice !== "" && v !== "") {
      const cost = parseInt(formCostPrice, 10) || 0;
      const margin = parseFloat(v);
      setFormUnitPrice(String(calcSellingPrice(cost, margin)));
    }
  };
  const handleEditCostChange = (v: string) => {
    setEditCostPrice(v);
    if (v !== "" && editMarginRate !== "") {
      const cost = parseInt(v, 10) || 0;
      const margin = parseFloat(editMarginRate);
      setEditUnitPrice(String(calcSellingPrice(cost, margin)));
    }
  };
  const handleEditMarginChange = (v: string) => {
    setEditMarginRate(v);
    if (editCostPrice !== "" && v !== "") {
      const cost = parseInt(editCostPrice, 10) || 0;
      const margin = parseFloat(v);
      setEditUnitPrice(String(calcSellingPrice(cost, margin)));
    }
  };

  // 標準工数の変更に応じて、レバーレート設定済みなら 提供価格＝工数×レバーレート を自動算出
  const laborRate = data?.labor_rate_per_hour ?? null;
  const handleFormLaborHoursChange = (v: string) => {
    setFormLaborHours(v);
    const price = calcLaborPrice(v === "" ? null : parseFloat(v), laborRate);
    if (price != null) setFormUnitPrice(String(price));
  };
  const handleEditLaborHoursChange = (v: string) => {
    setEditLaborHours(v);
    const price = calcLaborPrice(v === "" ? null : parseFloat(v), laborRate);
    if (price != null) setEditUnitPrice(String(price));
  };

  /* ---------- Edit ---------- */

  const startEdit = (item: MenuItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditItemCode(item.item_code ?? "");
    setEditDescription(item.description ?? "");
    setEditUnitPrice(item.unit_price != null ? String(item.unit_price) : "");
    setEditCostPrice(item.cost_price != null ? String(item.cost_price) : "");
    setEditMarginRate(item.margin_rate != null ? String(item.margin_rate) : "");
    setEditTaxCategory(item.tax_category != null ? String(item.tax_category) : "10");
    setEditEstimatedMinutes(item.estimated_minutes != null ? String(item.estimated_minutes) : "");
    setEditLaborHours(item.labor_hours != null ? String(item.labor_hours) : "");
    setEditCategoryLarge(item.category_large ?? "");
    setEditCategoryMedium(item.category_medium ?? "");
    setEditCategorySmall(item.category_small ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const r = await enqueueOrFetch({
        url: "/api/admin/menu-items",
        method: "PUT",
        body: {
          id: editingId,
          name: editName.trim(),
          item_code: editItemCode.trim() || null,
          description: editDescription.trim() || null,
          unit_price: editUnitPrice ? parseInt(editUnitPrice, 10) : 0,
          cost_price: editCostPrice ? parseInt(editCostPrice, 10) : 0,
          margin_rate: editMarginRate === "" ? null : parseFloat(editMarginRate),
          tax_category: parseInt(editTaxCategory, 10),
          estimated_minutes: editEstimatedMinutes === "" ? null : parseInt(editEstimatedMinutes, 10),
          labor_hours: editLaborHours === "" ? null : parseFloat(editLaborHours),
          category_large: editCategoryLarge.trim() || null,
          category_medium: editCategoryMedium.trim() || null,
          category_small: editCategorySmall.trim() || null,
        },
        label: `品目編集: ${editName.trim()}`,
        kind: "other",
      });
      if (r.queued) {
        setEditingId(null);
        setSaveMsg({ text: "📡 オフラインで保留しました。復帰後に同期されます。", ok: true });
        mutate();
        return;
      }
      const j = r.response ? await parseJsonSafe(r.response) : null;
      if (!r.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${r.status}`);
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
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: "品目を無効化しました", ok: true });
      mutate();
    } catch (e: any) {
      alert("無効化に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setDeletingId(null);
    }
  };

  /* ---------- Bulk Disable (logical) ---------- */

  const handleBulkDisable = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`選択した ${ids.length} 件の品目を無効化しますか？`)) return;
    setBulkDisabling(true);
    try {
      const res = await fetch("/api/admin/menu-items", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: `${j.disabled ?? ids.length} 件の品目を無効化しました`, ok: true });
      setSelectedIds(new Set());
      mutate();
    } catch (e: any) {
      alert("一括無効化に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setBulkDisabling(false);
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
      const j = await parseJsonSafe(res);
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

  /* ---------- Derived: カテゴリ絞り込み & サジェスト候補 ---------- */

  const allItems = data?.items ?? [];

  // 一覧に表示する品目（大→中→小の絞り込みを順に適用）
  const visibleItems = allItems.filter(
    (i) =>
      (!filterLarge || i.category_large === filterLarge) &&
      (!filterMedium || i.category_medium === filterMedium) &&
      (!filterSmall || i.category_small === filterSmall),
  );

  // datalist / 絞り込みプルダウン用の重複なし候補（上位の絞り込みに連動して段階的に絞る）
  const uniqSorted = (values: (string | null)[]) =>
    Array.from(new Set(values.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "ja"));
  const largeOptions = uniqSorted(allItems.map((i) => i.category_large));
  const mediumOptions = uniqSorted(
    allItems.filter((i) => !filterLarge || i.category_large === filterLarge).map((i) => i.category_medium),
  );
  const smallOptions = uniqSorted(
    allItems
      .filter(
        (i) =>
          (!filterLarge || i.category_large === filterLarge) && (!filterMedium || i.category_medium === filterMedium),
      )
      .map((i) => i.category_small),
  );
  const hasAnyCategory = largeOptions.length > 0 || mediumOptions.length > 0 || smallOptions.length > 0;

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
              onClick={() => {
                setShowCsv(!showCsv);
                setCsvMsg(null);
              }}
            >
              {showCsv ? "閉じる" : "CSVインポート"}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setShowForm(!showForm);
                setSaveMsg(null);
              }}
            >
              {showForm ? "閉じる" : "新規登録"}
            </button>
          </div>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      <FirstUseInlineGuide
        storageKey="menu_items"
        title="品目マスタとは"
        description="請求書・見積書を作るときに「品目」として呼び出せるメニュー一覧です。よく使う施工メニューを登録しておくと、毎回手入力する必要がなくなります。"
        steps={[
          {
            title: "「新規登録」または CSV インポート",
            description: "施工メニュー名・単価・税率区分を入力。CSVテンプレもダウンロード可能。",
          },
          {
            title: "請求書作成時に呼び出し",
            description: "請求書フォームの品目欄から登録済みメニューをワンクリックで追加できます。",
          },
          {
            title: "後から無効化・編集も可能",
            description: "値上げ等で価格を変える場合は編集、廃止する場合は無効化で履歴を残せます。",
          },
        ]}
      />

      {data && data.stats.total === 0 && !showForm && !showCsv && (
        <EmptyStateGuide
          icon="📋"
          title="最初の品目を登録しましょう"
          description="よく使う施工メニュー (例: ガラスコーティング、PPF施工、ヘッドライト磨きなど) を登録すると、請求書作成が劇的に速くなります。"
          steps={[
            { title: "「新規登録」をクリック", description: "右上のボタンから登録フォームを開きます。" },
            {
              title: "品目名・単価・税率区分を入力",
              description: "税率区分は標準10%か軽減8%。後から編集できます。",
            },
            {
              title: "CSV で一括登録もOK",
              description: "見本CSVをダウンロード → 編集 → アップロードで複数品目を一度に登録できます。",
            },
          ]}
          primaryAction={{
            label: "+ 最初の品目を登録",
            onClick: () => {
              setShowForm(true);
              setSaveMsg(null);
            },
          }}
          secondaryAction={{
            label: "CSV で一括登録",
            onClick: () => {
              setShowCsv(true);
              setCsvMsg(null);
            },
          }}
        />
      )}

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

          {saveMsg && <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>{saveMsg.text}</div>}

          {/* CSV Import */}
          {showCsv && (
            <section className="glass-card p-5 space-y-4">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">CSV取込</div>
                <div className="mt-1 text-base font-semibold text-primary">CSVインポート</div>
              </div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs text-muted">
                  形式:{" "}
                  <code className="text-secondary">
                    品目名,説明,単価,税率区分(10/8),標準工数(h),大カテゴリ,中カテゴリ,小カテゴリ
                  </code>
                  <span className="ml-1">
                    ※工数・カテゴリは任意。単価が空欄/0 かつレバーレート設定済みなら 工数×レバーレートで単価を自動算出
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs px-3 py-1"
                  onClick={() => {
                    const sample =
                      "品目名,説明,単価,税率区分,標準工数,大カテゴリ,中カテゴリ,小カテゴリ\nガラスコーティング,ボディ全面ガラスコーティング施工,55000,10,,コーティング,ボディ,ガラス系\nPPFフィルム施工,フロントバンパーPPF貼付,88000,10,,コーティング,ボディ,PPF\nヘッドライトコーティング,ヘッドライト黄ばみ除去+コーティング,15000,10,,コーティング,パーツ,ヘッドライト\nインテリアコーティング,本革シートコーティング,35000,10,,コーティング,内装,レザー\nホイールコーティング,4本セット,12000,10,,コーティング,パーツ,ホイール\nウィンドウフィルム施工,フロント3面,25000,10,,フィルム,ウィンドウ,\n鈑金塗装,バンパー修理塗装,45000,10,,整備,鈑金塗装,\nエンジンオイル交換,工数×レバーレートで単価自動算出の例,0,10,0.3,整備,一般整備,オイル\nブレーキパッド交換(フロント),工数×レバーレートで単価自動算出の例,0,10,1.2,整備,一般整備,ブレーキ\n証明書発行手数料,施工証明書の発行,3300,10,,その他,手数料,\nNFCタグ取付,NFCタグ1枚取付,1100,10,,その他,オプション,\n消耗品,コーティング剤等消耗品,2200,10,,その他,消耗品,";
                    const blob = new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "ledra_品目マスタ_見本.csv";
                    a.click();
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
              {csvMsg && <div className={`text-sm ${csvMsg.ok ? "text-success" : "text-danger"}`}>{csvMsg.text}</div>}
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
                  onClick={() => {
                    setShowCsv(false);
                    setCsvText("");
                    setCsvMsg(null);
                  }}
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
                  <label className="text-xs text-muted">品番</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="例: GC-001（任意・帳票作成時の検索に使用）"
                    value={formItemCode}
                    onChange={(e) => setFormItemCode(e.target.value)}
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
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs text-muted">カテゴリ（大 / 中 / 小・任意）</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      className="input-field"
                      list="menu-cat-large"
                      placeholder="大カテゴリ 例: コーティング"
                      value={formCategoryLarge}
                      onChange={(e) => setFormCategoryLarge(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-field"
                      list="menu-cat-medium"
                      placeholder="中カテゴリ 例: ボディ"
                      value={formCategoryMedium}
                      onChange={(e) => setFormCategoryMedium(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-field"
                      list="menu-cat-small"
                      placeholder="小カテゴリ 例: ガラス系"
                      value={formCategorySmall}
                      onChange={(e) => setFormCategorySmall(e.target.value)}
                    />
                  </div>
                  <p className="text-[10px] text-muted">既存のカテゴリから選択、または新しく入力して作成できます</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">原価</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    placeholder="0"
                    value={formCostPrice}
                    onChange={(e) => handleFormCostChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">利益率（%）</label>
                  <input
                    type="number"
                    className="input-field"
                    step="0.01"
                    placeholder="例: 30"
                    value={formMarginRate}
                    onChange={(e) => handleFormMarginChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">標準工数（h）</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    step="0.1"
                    placeholder="例: 1.2"
                    value={formLaborHours}
                    onChange={(e) => handleFormLaborHoursChange(e.target.value)}
                  />
                  <p className="text-[10px] text-muted">
                    {laborRate != null
                      ? `レバーレート ${formatJpy(laborRate)}/h × 工数で提供価格を自動算出`
                      : "設定 > 工賃設定 でレバーレートを登録すると工賃を自動算出できます"}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted">
                    提供価格（単価）
                    {formLaborHours !== "" && laborRate != null ? (
                      <span className="ml-2 text-[10px] text-success">＝工数×レバーレート 自動算出</span>
                    ) : (
                      formCostPrice &&
                      formMarginRate !== "" && (
                        <span className="ml-2 text-[10px] text-success">＝原価×(1+利益率%) 自動算出</span>
                      )
                    )}
                  </label>
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
                <div className="space-y-1">
                  <label className="text-xs text-muted">標準作業時間（分）</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    placeholder="例: 120"
                    value={formEstimatedMinutes}
                    onChange={(e) => setFormEstimatedMinutes(e.target.value)}
                  />
                  <p className="text-[10px] text-muted">ピット所要時間の概算に使用（車両サイズで自動補正）</p>
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
                  onClick={() => {
                    setShowForm(false);
                  }}
                >
                  キャンセル
                </button>
              </div>
            </section>
          )}

          {/* Items List */}
          <section className="glass-card overflow-hidden">
            <div className="border-b border-border-subtle p-5 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">品目一覧</div>
                <div className="mt-1 text-base font-semibold text-primary">品目一覧</div>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-secondary">{selectedIds.size} 件選択中</span>
                  <button
                    type="button"
                    className="btn-ghost px-3 py-1 text-xs"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    選択解除
                  </button>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1 text-xs"
                    disabled={bulkDisabling}
                    onClick={handleBulkDisable}
                  >
                    {bulkDisabling ? "無効化中…" : "選択した品目を無効化"}
                  </button>
                </div>
              )}
            </div>
            {hasAnyCategory && (
              <div className="border-b border-border-subtle px-5 py-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">カテゴリで絞り込み:</span>
                <select
                  className="select-field py-1 text-sm"
                  value={filterLarge}
                  onChange={(e) => {
                    setFilterLarge(e.target.value);
                    setFilterMedium("");
                    setFilterSmall("");
                  }}
                >
                  <option value="">大カテゴリ（すべて）</option>
                  {largeOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  className="select-field py-1 text-sm"
                  value={filterMedium}
                  onChange={(e) => {
                    setFilterMedium(e.target.value);
                    setFilterSmall("");
                  }}
                >
                  <option value="">中カテゴリ（すべて）</option>
                  {mediumOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  className="select-field py-1 text-sm"
                  value={filterSmall}
                  onChange={(e) => setFilterSmall(e.target.value)}
                >
                  <option value="">小カテゴリ（すべて）</option>
                  {smallOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {(filterLarge || filterMedium || filterSmall) && (
                  <>
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1 text-xs"
                      onClick={() => {
                        setFilterLarge("");
                        setFilterMedium("");
                        setFilterSmall("");
                      }}
                    >
                      絞り込み解除
                    </button>
                    <span className="text-xs text-muted">{visibleItems.length} 件表示中</span>
                  </>
                )}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="w-10 px-5 py-3">
                      {(() => {
                        // 絞り込み表示中の有効な品目のみを全選択対象にする
                        const activeItems = visibleItems.filter((i) => i.is_active);
                        const allSelected = activeItems.length > 0 && activeItems.every((i) => selectedIds.has(i.id));
                        return (
                          <input
                            type="checkbox"
                            aria-label="表示中の全ての有効な品目を選択"
                            className="h-4 w-4 accent-[var(--accent-blue)] cursor-pointer"
                            disabled={activeItems.length === 0}
                            checked={allSelected}
                            onChange={(e) =>
                              setSelectedIds(e.target.checked ? new Set(activeItems.map((i) => i.id)) : new Set())
                            }
                          />
                        );
                      })()}
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">品目名</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      品番
                    </th>
                    <th className="hidden lg:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      カテゴリ
                    </th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      説明
                    </th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      原価
                    </th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      利益率
                    </th>
                    <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      工数(h)
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">提供価格</th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      税率
                    </th>
                    <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                      状態
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {visibleItems.map((item) => (
                    <Fragment key={item.id}>
                      <tr className="hover:bg-surface-hover/60">
                        <td className="w-10 px-5 py-3 align-middle">
                          {item.is_active && (
                            <input
                              type="checkbox"
                              aria-label={`${item.name} を選択`}
                              className="h-4 w-4 accent-[var(--accent-blue)] cursor-pointer"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelected(item.id)}
                            />
                          )}
                        </td>
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
                                placeholder="品番"
                                value={editItemCode}
                                onChange={(e) => setEditItemCode(e.target.value)}
                              />
                            </td>
                            <td className="hidden lg:table-cell px-5 py-3">
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  className="input-field py-1 text-sm"
                                  list="menu-cat-large"
                                  placeholder="大カテゴリ"
                                  value={editCategoryLarge}
                                  onChange={(e) => setEditCategoryLarge(e.target.value)}
                                />
                                <input
                                  type="text"
                                  className="input-field py-1 text-sm"
                                  list="menu-cat-medium"
                                  placeholder="中カテゴリ"
                                  value={editCategoryMedium}
                                  onChange={(e) => setEditCategoryMedium(e.target.value)}
                                />
                                <input
                                  type="text"
                                  className="input-field py-1 text-sm"
                                  list="menu-cat-small"
                                  placeholder="小カテゴリ"
                                  value={editCategorySmall}
                                  onChange={(e) => setEditCategorySmall(e.target.value)}
                                />
                              </div>
                            </td>
                            <td className="hidden md:table-cell px-5 py-3">
                              <input
                                type="text"
                                className="input-field py-1 text-sm"
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                              />
                            </td>
                            <td className="hidden md:table-cell px-5 py-3">
                              <input
                                type="number"
                                className="input-field py-1 text-sm"
                                min="0"
                                placeholder="0"
                                value={editCostPrice}
                                onChange={(e) => handleEditCostChange(e.target.value)}
                              />
                            </td>
                            <td className="hidden md:table-cell px-5 py-3">
                              <input
                                type="number"
                                className="input-field py-1 text-sm"
                                step="0.01"
                                placeholder="%"
                                value={editMarginRate}
                                onChange={(e) => handleEditMarginChange(e.target.value)}
                              />
                            </td>
                            <td className="hidden md:table-cell px-5 py-3">
                              <input
                                type="number"
                                className="input-field py-1 text-sm"
                                min="0"
                                step="0.1"
                                placeholder="h"
                                title="標準工数（時間）"
                                value={editLaborHours}
                                onChange={(e) => handleEditLaborHoursChange(e.target.value)}
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
                              <div className="mt-1">
                                <AiPriceHint
                                  menuItemId={item.id}
                                  onApply={(price) => setEditUnitPrice(String(price))}
                                />
                              </div>
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
                              <input
                                type="number"
                                className="input-field py-1 text-sm mt-1"
                                min="0"
                                placeholder="作業分"
                                title="標準作業時間（分）"
                                value={editEstimatedMinutes}
                                onChange={(e) => setEditEstimatedMinutes(e.target.value)}
                              />
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
                                <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={cancelEdit}>
                                  取消
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          /* Display Row */
                          <>
                            <td className="px-5 py-3.5 font-medium text-primary">{item.name}</td>
                            <td className="hidden sm:table-cell px-5 py-3.5 text-secondary font-mono text-xs">
                              {item.item_code ?? "-"}
                            </td>
                            <td className="hidden lg:table-cell px-5 py-3.5 text-secondary">
                              {[item.category_large, item.category_medium, item.category_small].some(Boolean) ? (
                                <span className="whitespace-nowrap">
                                  {[item.category_large, item.category_medium, item.category_small]
                                    .filter(Boolean)
                                    .join(" › ")}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className="hidden md:table-cell px-5 py-3.5 text-secondary">
                              {item.description ?? "-"}
                            </td>
                            <td className="hidden md:table-cell px-5 py-3.5 text-secondary whitespace-nowrap">
                              {item.cost_price ? formatJpy(item.cost_price) : "-"}
                            </td>
                            <td className="hidden md:table-cell px-5 py-3.5 text-secondary whitespace-nowrap">
                              {item.margin_rate != null ? `${item.margin_rate}%` : "-"}
                            </td>
                            <td className="hidden md:table-cell px-5 py-3.5 text-secondary whitespace-nowrap">
                              {item.labor_hours != null ? `${item.labor_hours}h` : "-"}
                            </td>
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
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn-ghost px-3 py-1 text-xs"
                                  onClick={() => startEdit(item)}
                                >
                                  編集
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost px-3 py-1 text-xs"
                                  onClick={() => togglePackages(item.id)}
                                  aria-expanded={packagesOpen.has(item.id)}
                                  data-testid={`menu-item-packages-toggle-${item.id}`}
                                >
                                  {packagesOpen.has(item.id) ? "▾ パッケージを隠す" : "▸ 使用パッケージ"}
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
                      {packagesOpen.has(item.id) && (
                        <tr className="bg-inset">
                          <td colSpan={12} className="px-5 py-3">
                            <div className="text-[10px] font-semibold tracking-[0.18em] text-muted">
                              この品目を使うパッケージ
                            </div>
                            <div className="mt-2">
                              <MenuItemPackagesPanel menuItemId={item.id} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {visibleItems.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-5 py-8 text-center text-muted">
                        {allItems.length === 0
                          ? "品目が登録されていません"
                          : "この絞り込み条件に一致する品目はありません"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* カテゴリ入力のサジェスト候補（登録/編集フォーム共用）。既存値から選べつつ新規入力も可 */}
          <datalist id="menu-cat-large">
            {largeOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="menu-cat-medium">
            {mediumOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="menu-cat-small">
            {smallOptions.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
