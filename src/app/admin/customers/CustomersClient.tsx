"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Pagination from "@/components/ui/Pagination";
import MutationGuard from "@/components/ui/MutationGuard";
import EmptyStateGuide from "@/components/ui/EmptyStateGuide";
import IdentityScanButton, { type IdentityScanFields } from "@/components/admin/customers/IdentityScanButton";
import LinkedTenantPicker from "./LinkedTenantPicker";
import { formatDate } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import { lookupPostalAddress, normalizePostalCode } from "@/lib/address/postalLookup";

type Customer = {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
  customer_type: "individual" | "corporate" | null;
  billing_cycle: "per_job" | "consolidated" | null;
  billing_terms_note: string | null;
  closing_day: number | null;
  payment_terms_days: number | null;
  linked_tenant_id: string | null;
  corporate_number: string | null;
  invoice_registration_number: string | null;
  short_name: string | null;
  honorific: "御中" | "様" | "" | null;
  transfer_fee_payer: "customer" | "company" | null;
  document_delivery_method: "download" | "email" | null;
  nda_status: "signed" | "unsigned" | null;
  basic_contract_status: "signed" | "unsigned" | null;
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
  customer_type: "individual" as "individual" | "corporate",
  billing_cycle: "" as "" | "per_job" | "consolidated",
  billing_terms_note: "",
  closing_day: "",
  payment_terms_days: "",
  linked_tenant_id: "",
  linked_tenant_name: "",
  corporate_number: "",
  invoice_registration_number: "",
  short_name: "",
  honorific: "" as "" | "御中" | "様",
  transfer_fee_payer: "" as "" | "customer" | "company",
  document_delivery_method: "" as "" | "download" | "email",
  nda_status: "unsigned" as "signed" | "unsigned",
  basic_contract_status: "unsigned" as "signed" | "unsigned",
};

export default function CustomersClient() {
  // 飛び込み案件画面などから ?create=1 で遷移してきたら登録フォームを自動で開く
  const searchParams = useSearchParams();
  const autoOpenForm = searchParams.get("create") === "1";

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

  const {
    data,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<CustomersData>(swrKey, fetcher, {
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 2000,
  });

  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : null;

  // Add form
  const [showForm, setShowForm] = useState(autoOpenForm);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // CSV 一括登録 (個人・法人を同一 CSV で混在可能)
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleCsvImport = async (file: File) => {
    setImporting(true);
    setSaveMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/customers/bulk-import", { method: "POST", body: fd });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      const { inserted = 0, updated = 0, skipped = 0, errors = [] } = j ?? {};
      const parts = [`新規${inserted}件`, `更新${updated}件`];
      if (skipped > 0) parts.push(`スキップ${skipped}件`);
      // row_index はデータ行 (ヘッダ除く) の 0 始まり。CSV ファイル上の行番号は
      // ヘッダ 1 行 + 1 始まりで +2。ユーザーが実ファイルの行に辿れるようにする。
      const detail = errors.length > 0 ? `（例: ${errors[0].row_index + 2}行目 ${errors[0].error}）` : "";
      setSaveMsg({ text: `CSV取込完了: ${parts.join(" / ")}${detail}`, ok: skipped === 0 });
      mutate();
    } catch (e: any) {
      setSaveMsg({ text: "CSV取込に失敗しました: " + (e?.message ?? String(e)), ok: false });
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  };

  // 記入例つきテンプレートを DL。ヘッダは bulk-import が受ける列に一致させる。
  const downloadCsvTemplate = () => {
    const header =
      "name,name_kana,email,phone,postal_code,address,note,customer_type,corporate_number,invoice_registration_number,billing_cycle,short_name,honorific";
    const sampleIndividual =
      "山田太郎,ヤマダタロウ,taro@example.com,090-1234-5678,1234567,東京都渋谷区1-2-3,,個人,,,,,様";
    const sampleCorporate =
      "株式会社サンプル,カブシキガイシャサンプル,info@sample.co.jp,03-1234-5678,1000001,東京都千代田区1-1,,法人,1234567890123,T1234567890123,合算,サンプル,御中";
    const csv = "﻿" + [header, sampleIndividual, sampleCorporate].join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // 郵便番号 → 住所 自動補完 (7桁揃った時点で照会し、住所が空の場合のみ埋める)
  const [postalHint, setPostalHint] = useState<string | null>(null);
  const [editPostalHint, setEditPostalHint] = useState<string | null>(null);

  // 法人番号 → 会社情報 自動補完 (13桁揃った時点で国税庁 gBizINFO を照会)。
  // 法人登録の入力を簡略化する狙い。会社名・住所は空欄のときだけ埋め、入力済みは上書きしない。
  const [corpLookup, setCorpLookup] = useState<{
    status: "idle" | "loading" | "done" | "notfound";
    target: "create" | "edit" | null;
  }>({ status: "idle", target: null });

  const lookupCorporate = useCallback(async (number: string, target: "create" | "edit") => {
    const cleaned = number.replace(/[-\s]/g, "");
    if (!/^\d{13}$/.test(cleaned)) return;
    setCorpLookup({ status: "loading", target });
    try {
      const res = await fetch(`/api/join/lookup-corporate?number=${encodeURIComponent(cleaned)}`);
      if (!res.ok) {
        setCorpLookup({ status: "notfound", target });
        return;
      }
      const j = await res.json();
      const setState = target === "create" ? setForm : setEditForm;
      let applied = false;
      setState((prev) => {
        // 照会中に法人番号が書き換わっていたら、古いレスポンス (別会社) で
        // 上書きしない (stale-request ガード)。法人番号フィールドは法人区分の
        // ときだけ表示されるため、customer_type の変更は不要。
        if (prev.corporate_number.replace(/[-\s]/g, "") !== cleaned) return prev;
        applied = true;
        // 会社名・住所は未入力のときだけ補完 (入力済みは尊重)。
        return {
          ...prev,
          name: prev.name.trim() ? prev.name : (j.company_name ?? prev.name),
          address: prev.address.trim() ? prev.address : (j.address ?? prev.address),
        };
      });
      if (applied) setCorpLookup({ status: "done", target });
    } catch {
      setCorpLookup({ status: "notfound", target });
    }
  }, []);

  const handleCorporateNumberChange = useCallback(
    (value: string, target: "create" | "edit") => {
      const setState = target === "create" ? setForm : setEditForm;
      setState((prev) => ({ ...prev, corporate_number: value }));
      setCorpLookup({ status: "idle", target });
      const cleaned = value.replace(/[-\s]/g, "");
      if (/^\d{13}$/.test(cleaned)) void lookupCorporate(cleaned, target);
    },
    [lookupCorporate],
  );

  const autofillAddressFromPostal = useCallback(async (code: string, target: "create" | "edit") => {
    const setHint = target === "create" ? setPostalHint : setEditPostalHint;
    if (!normalizePostalCode(code)) {
      setHint(null);
      return;
    }
    const addr = await lookupPostalAddress(code);
    if (!addr) return;
    const setState = target === "create" ? setForm : setEditForm;
    let filled = false;
    setState((prev) => {
      if (prev.address.trim()) return prev; // 入力済みの住所は上書きしない
      filled = true;
      return { ...prev, address: addr.full };
    });
    setHint(filled ? "郵便番号から住所を補完しました（番地以降を追記してください）" : null);
  }, []);

  const handleSearch = () => {
    setActiveSearch(search.trim());
    setPage(1);
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // 個人ならサイクルは常に null、法人でも未選択は null に寄せる ("" は enum 不一致)。
      const billing_cycle = form.customer_type === "corporate" && form.billing_cycle ? form.billing_cycle : null;
      const honorific = form.honorific || null;
      const transfer_fee_payer = form.transfer_fee_payer || null;
      const document_delivery_method = form.document_delivery_method || null;
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          billing_cycle,
          honorific,
          transfer_fee_payer,
          document_delivery_method,
        }),
      });
      const j = await parseJsonSafe(res);
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
      customer_type: c.customer_type ?? "individual",
      billing_cycle: c.billing_cycle ?? "",
      billing_terms_note: c.billing_terms_note ?? "",
      closing_day: c.closing_day != null ? String(c.closing_day) : "",
      payment_terms_days: c.payment_terms_days != null ? String(c.payment_terms_days) : "",
      linked_tenant_id: c.linked_tenant_id ?? "",
      linked_tenant_name: "",
      corporate_number: c.corporate_number ?? "",
      invoice_registration_number: c.invoice_registration_number ?? "",
      short_name: c.short_name ?? "",
      honorific: c.honorific ?? "",
      transfer_fee_payer: c.transfer_fee_payer ?? "",
      document_delivery_method: c.document_delivery_method ?? "",
      nda_status: c.nda_status ?? "unsigned",
      basic_contract_status: c.basic_contract_status ?? "unsigned",
    });
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setEditSaving(true);
    try {
      // 個人ならサイクルは常に null、法人でも未選択は null に寄せる ("" は enum 不一致)。
      const billing_cycle =
        editForm.customer_type === "corporate" && editForm.billing_cycle ? editForm.billing_cycle : null;
      const honorific = editForm.honorific || null;
      const transfer_fee_payer = editForm.transfer_fee_payer || null;
      const document_delivery_method = editForm.document_delivery_method || null;
      const res = await fetch("/api/admin/customers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          ...editForm,
          billing_cycle,
          honorific,
          transfer_fee_payer,
          document_delivery_method,
        }),
      });
      const j = await parseJsonSafe(res);
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
      const j = await parseJsonSafe(res);
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
          <MutationGuard>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleCsvImport(f);
                }}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={downloadCsvTemplate}
                title="個人・法人を混在して一括登録できるCSVの記入例テンプレートをダウンロードします"
              >
                CSVテンプレート
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={importing}
                onClick={() => csvInputRef.current?.click()}
                title="個人・法人をまとめてCSVで一括登録します"
              >
                {importing ? "取込中…" : "CSVで一括登録"}
              </button>
              <Link
                href="/admin/customer-intakes"
                className="btn-secondary"
                title="お客様自身がスマホから登録できるWeb登録用URL・QRコードを発行します"
              >
                Web登録URLを発行
              </Link>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setShowForm(!showForm);
                  setSaveMsg(null);
                }}
              >
                {showForm ? "閉じる" : "新規追加"}
              </button>
            </div>
          </MutationGuard>
        }
      />

      {loading && <div className="text-sm text-muted">読み込み中…</div>}
      {err && <div className="glass-card p-4 text-sm text-danger">{err}</div>}

      {data &&
        (() => {
          const isFirstUse = data.stats.total === 0 && !activeSearch;
          return (
            <>
              {!isFirstUse && (
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
              )}

              {/* Search */}
              {!isFirstUse && (
                <section className="glass-card p-5">
                  <div className="flex gap-3 items-end flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1">
                      <label className="text-xs text-muted">検索（名前・メール・電話番号）</label>
                      <input
                        type="text"
                        placeholder="検索キーワード"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSearch();
                        }}
                        className="input-field"
                      />
                    </div>
                    <button type="button" className="btn-secondary" onClick={handleSearch}>
                      検索
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setSearch("");
                        setActiveSearch("");
                        setPage(1);
                      }}
                    >
                      クリア
                    </button>
                  </div>
                </section>
              )}

              {isFirstUse && !showForm && (
                <EmptyStateGuide
                  icon="👤"
                  title="最初の顧客を登録しましょう"
                  description="顧客情報を登録すると、車両・証明書・請求書を1人のお客様にひも付けて管理できます。同じ顧客が再来店したときも履歴をすぐ呼び出せます。"
                  steps={[
                    {
                      title: "「新規追加」をクリック",
                      description: "右上のボタンまたは下のボタンから登録フォームを開きます。",
                    },
                    {
                      title: "名前と連絡先を入力",
                      description: "氏名は必須。メール・電話番号はあとから追加できます。",
                    },
                    {
                      title: "車両・証明書を紐付け",
                      description: "登録後の顧客詳細画面から、車両登録・証明書発行へワンタップで進めます。",
                    },
                  ]}
                  primaryAction={{
                    label: "+ 最初の顧客を登録",
                    onClick: () => {
                      setShowForm(true);
                      setSaveMsg(null);
                    },
                  }}
                  secondaryAction={{ label: "車両から登録", href: "/admin/vehicles/new" }}
                />
              )}

              {saveMsg && (
                <div className={`text-sm ${saveMsg.ok ? "text-success" : "text-danger"}`}>{saveMsg.text}</div>
              )}

              {/* Add Form */}
              {showForm && (
                <section className="glass-card p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold tracking-[0.18em] text-muted">新規登録</div>
                      <div className="mt-1 text-base font-semibold text-primary">新規顧客登録</div>
                    </div>
                    <IdentityScanButton
                      onComplete={(f: IdentityScanFields) => {
                        setForm((prev) => ({
                          ...prev,
                          name: f.name ?? prev.name,
                          name_kana: f.name_kana ?? prev.name_kana,
                          postal_code: f.postal_code ?? prev.postal_code,
                          address: f.address ?? prev.address,
                        }));
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted">
                        顧客名 <span className="text-danger">*</span>
                      </label>
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
                        onChange={(e) => {
                          const v = e.target.value;
                          setForm({ ...form, postal_code: v });
                          void autofillAddressFromPostal(v, "create");
                        }}
                        className="input-field"
                        placeholder="123-4567"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">住所</label>
                      <input
                        type="text"
                        value={form.address}
                        onChange={(e) => {
                          setForm({ ...form, address: e.target.value });
                          setPostalHint(null);
                        }}
                        className="input-field"
                        placeholder="東京都渋谷区..."
                      />
                      {postalHint && <p className="text-xs text-muted">{postalHint}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">顧客略称名</label>
                      <input
                        type="text"
                        value={form.short_name}
                        onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                        className="input-field"
                        placeholder="画面表示用の略称 (書類は顧客名を使用)"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">敬称</label>
                      <select
                        value={form.honorific}
                        onChange={(e) => setForm({ ...form, honorific: e.target.value as "" | "御中" | "様" })}
                        className="input-field"
                      >
                        <option value="">未設定</option>
                        <option value="御中">御中</option>
                        <option value="様">様</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">振込手数料負担</label>
                      <select
                        value={form.transfer_fee_payer}
                        onChange={(e) =>
                          setForm({ ...form, transfer_fee_payer: e.target.value as "" | "customer" | "company" })
                        }
                        className="input-field"
                      >
                        <option value="">未設定</option>
                        <option value="customer">先方負担</option>
                        <option value="company">当方負担</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">書類送付方法</label>
                      <select
                        value={form.document_delivery_method}
                        onChange={(e) =>
                          setForm({ ...form, document_delivery_method: e.target.value as "" | "download" | "email" })
                        }
                        className="input-field"
                      >
                        <option value="">未設定</option>
                        <option value="download">DLページ方式</option>
                        <option value="email">メール添付方式</option>
                      </select>
                    </div>
                  </div>
                  {/* 顧客区分 + 法人の支払い条件 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted">顧客区分</label>
                      <select
                        value={form.customer_type}
                        onChange={(e) =>
                          setForm({ ...form, customer_type: e.target.value as "individual" | "corporate" })
                        }
                        className="input-field"
                      >
                        <option value="individual">個人 (BtoC)</option>
                        <option value="corporate">法人 (BtoB)</option>
                      </select>
                    </div>
                    {form.customer_type === "corporate" && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted">
                          支払いサイクル <span className="text-danger">*</span>
                        </label>
                        <select
                          value={form.billing_cycle}
                          onChange={(e) =>
                            setForm({ ...form, billing_cycle: e.target.value as "" | "per_job" | "consolidated" })
                          }
                          className="input-field"
                        >
                          <option value="">— 選択してください —</option>
                          <option value="per_job">都度払い (案件ごとに会計)</option>
                          <option value="consolidated">合算・締め払い (後日まとめて請求)</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {form.customer_type === "corporate" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted">支払い条件メモ (締め日・支払いサイト等)</label>
                      <input
                        type="text"
                        value={form.billing_terms_note}
                        onChange={(e) => setForm({ ...form, billing_terms_note: e.target.value })}
                        className="input-field"
                        placeholder="例: 月末締め翌月末払い"
                      />
                    </div>
                  )}
                  {form.customer_type === "corporate" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-muted">締め日</label>
                        <select
                          value={form.closing_day}
                          onChange={(e) => setForm({ ...form, closing_day: e.target.value })}
                          className="input-field"
                        >
                          <option value="">未設定（都度扱い）</option>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d)}>
                              {d === 31 ? "末締め" : `${d}日`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">支払サイト（日数）</label>
                        <input
                          type="number"
                          min={0}
                          max={180}
                          value={form.payment_terms_days}
                          onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
                          className="input-field"
                          placeholder="例: 30（締め日から30日後が期限。空欄=30）"
                        />
                      </div>
                    </div>
                  )}
                  {form.customer_type === "corporate" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted">
                        取引先（Ledra 利用店）— 合算・締め払いの自動請求に使用（任意）
                      </label>
                      <LinkedTenantPicker
                        valueId={form.linked_tenant_id}
                        valueName={form.linked_tenant_name}
                        onChange={(id, nm) => setForm({ ...form, linked_tenant_id: id, linked_tenant_name: nm })}
                      />
                    </div>
                  )}
                  {form.customer_type === "corporate" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-muted">法人番号</label>
                        <input
                          type="text"
                          value={form.corporate_number}
                          onChange={(e) => handleCorporateNumberChange(e.target.value, "create")}
                          className="input-field"
                          placeholder="13桁の数字 (入力で会社名・住所を自動取得)"
                          maxLength={13}
                        />
                        {corpLookup.target === "create" && corpLookup.status === "loading" && (
                          <p className="text-xs text-muted">国税庁データベースを照会中…</p>
                        )}
                        {corpLookup.target === "create" && corpLookup.status === "done" && (
                          <p className="text-xs text-success">法人番号から会社情報を反映しました（空欄のみ補完）</p>
                        )}
                        {corpLookup.target === "create" && corpLookup.status === "notfound" && (
                          <p className="text-xs text-muted">法人情報が見つかりませんでした（手入力してください）</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">インボイス登録番号</label>
                        <input
                          type="text"
                          value={form.invoice_registration_number}
                          onChange={(e) => setForm({ ...form, invoice_registration_number: e.target.value })}
                          className="input-field"
                          placeholder="T + 13桁の数字"
                          maxLength={14}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">NDA締結</label>
                        <select
                          value={form.nda_status}
                          onChange={(e) => setForm({ ...form, nda_status: e.target.value as "signed" | "unsigned" })}
                          className="input-field"
                        >
                          <option value="unsigned">未</option>
                          <option value="signed">済</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">基本契約書締結</label>
                        <select
                          value={form.basic_contract_status}
                          onChange={(e) =>
                            setForm({ ...form, basic_contract_status: e.target.value as "signed" | "unsigned" })
                          }
                          className="input-field"
                        >
                          <option value="unsigned">未</option>
                          <option value="signed">済</option>
                        </select>
                      </div>
                    </div>
                  )}
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
                      disabled={
                        saving || !form.name.trim() || (form.customer_type === "corporate" && !form.billing_cycle)
                      }
                      onClick={handleAdd}
                    >
                      {saving ? "保存中…" : "登録"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setShowForm(false);
                        setForm({ ...emptyForm });
                      }}
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
                      <label className="text-xs text-muted">
                        顧客名 <span className="text-danger">*</span>
                      </label>
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
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditForm({ ...editForm, postal_code: v });
                          void autofillAddressFromPostal(v, "edit");
                        }}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">住所</label>
                      <input
                        type="text"
                        value={editForm.address}
                        onChange={(e) => {
                          setEditForm({ ...editForm, address: e.target.value });
                          setEditPostalHint(null);
                        }}
                        className="input-field"
                      />
                      {editPostalHint && <p className="text-xs text-muted">{editPostalHint}</p>}
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">顧客略称名</label>
                      <input
                        type="text"
                        value={editForm.short_name}
                        onChange={(e) => setEditForm({ ...editForm, short_name: e.target.value })}
                        className="input-field"
                        placeholder="画面表示用の略称 (書類は顧客名を使用)"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">敬称</label>
                      <select
                        value={editForm.honorific}
                        onChange={(e) => setEditForm({ ...editForm, honorific: e.target.value as "" | "御中" | "様" })}
                        className="input-field"
                      >
                        <option value="">未設定</option>
                        <option value="御中">御中</option>
                        <option value="様">様</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">振込手数料負担</label>
                      <select
                        value={editForm.transfer_fee_payer}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            transfer_fee_payer: e.target.value as "" | "customer" | "company",
                          })
                        }
                        className="input-field"
                      >
                        <option value="">未設定</option>
                        <option value="customer">先方負担</option>
                        <option value="company">当方負担</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted">書類送付方法</label>
                      <select
                        value={editForm.document_delivery_method}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            document_delivery_method: e.target.value as "" | "download" | "email",
                          })
                        }
                        className="input-field"
                      >
                        <option value="">未設定</option>
                        <option value="download">DLページ方式</option>
                        <option value="email">メール添付方式</option>
                      </select>
                    </div>
                  </div>
                  {/* 顧客区分 + 法人の支払い条件 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs text-muted">顧客区分</label>
                      <select
                        value={editForm.customer_type}
                        onChange={(e) =>
                          setEditForm({ ...editForm, customer_type: e.target.value as "individual" | "corporate" })
                        }
                        className="input-field"
                      >
                        <option value="individual">個人 (BtoC)</option>
                        <option value="corporate">法人 (BtoB)</option>
                      </select>
                    </div>
                    {editForm.customer_type === "corporate" && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted">
                          支払いサイクル <span className="text-danger">*</span>
                        </label>
                        <select
                          value={editForm.billing_cycle}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              billing_cycle: e.target.value as "" | "per_job" | "consolidated",
                            })
                          }
                          className="input-field"
                        >
                          <option value="">— 選択してください —</option>
                          <option value="per_job">都度払い (案件ごとに会計)</option>
                          <option value="consolidated">合算・締め払い (後日まとめて請求)</option>
                        </select>
                      </div>
                    )}
                  </div>
                  {editForm.customer_type === "corporate" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted">支払い条件メモ (締め日・支払いサイト等)</label>
                      <input
                        type="text"
                        value={editForm.billing_terms_note}
                        onChange={(e) => setEditForm({ ...editForm, billing_terms_note: e.target.value })}
                        className="input-field"
                        placeholder="例: 月末締め翌月末払い"
                      />
                    </div>
                  )}
                  {editForm.customer_type === "corporate" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-muted">締め日</label>
                        <select
                          value={editForm.closing_day}
                          onChange={(e) => setEditForm({ ...editForm, closing_day: e.target.value })}
                          className="input-field"
                        >
                          <option value="">未設定（都度扱い）</option>
                          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d)}>
                              {d === 31 ? "末締め" : `${d}日`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">支払サイト（日数）</label>
                        <input
                          type="number"
                          min={0}
                          max={180}
                          value={editForm.payment_terms_days}
                          onChange={(e) => setEditForm({ ...editForm, payment_terms_days: e.target.value })}
                          className="input-field"
                          placeholder="例: 30（空欄=30）"
                        />
                      </div>
                    </div>
                  )}
                  {editForm.customer_type === "corporate" && (
                    <div className="space-y-1">
                      <label className="text-xs text-muted">
                        取引先（Ledra 利用店）— 合算・締め払いの自動請求に使用（任意）
                      </label>
                      <LinkedTenantPicker
                        valueId={editForm.linked_tenant_id}
                        valueName={editForm.linked_tenant_name || editForm.name}
                        onChange={(id, nm) =>
                          setEditForm({ ...editForm, linked_tenant_id: id, linked_tenant_name: nm })
                        }
                      />
                    </div>
                  )}
                  {editForm.customer_type === "corporate" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs text-muted">法人番号</label>
                        <input
                          type="text"
                          value={editForm.corporate_number}
                          onChange={(e) => handleCorporateNumberChange(e.target.value, "edit")}
                          className="input-field"
                          placeholder="13桁の数字 (入力で会社名・住所を自動取得)"
                          maxLength={13}
                        />
                        {corpLookup.target === "edit" && corpLookup.status === "loading" && (
                          <p className="text-xs text-muted">国税庁データベースを照会中…</p>
                        )}
                        {corpLookup.target === "edit" && corpLookup.status === "done" && (
                          <p className="text-xs text-success">法人番号から会社情報を反映しました（空欄のみ補完）</p>
                        )}
                        {corpLookup.target === "edit" && corpLookup.status === "notfound" && (
                          <p className="text-xs text-muted">法人情報が見つかりませんでした（手入力してください）</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">インボイス登録番号</label>
                        <input
                          type="text"
                          value={editForm.invoice_registration_number}
                          onChange={(e) => setEditForm({ ...editForm, invoice_registration_number: e.target.value })}
                          className="input-field"
                          placeholder="T + 13桁の数字"
                          maxLength={14}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">NDA締結</label>
                        <select
                          value={editForm.nda_status}
                          onChange={(e) =>
                            setEditForm({ ...editForm, nda_status: e.target.value as "signed" | "unsigned" })
                          }
                          className="input-field"
                        >
                          <option value="unsigned">未</option>
                          <option value="signed">済</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted">基本契約書締結</label>
                        <select
                          value={editForm.basic_contract_status}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              basic_contract_status: e.target.value as "signed" | "unsigned",
                            })
                          }
                          className="input-field"
                        >
                          <option value="unsigned">未</option>
                          <option value="signed">済</option>
                        </select>
                      </div>
                    </div>
                  )}
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
                      disabled={
                        editSaving ||
                        !editForm.name.trim() ||
                        (editForm.customer_type === "corporate" && !editForm.billing_cycle)
                      }
                      onClick={handleUpdate}
                    >
                      {editSaving ? "更新中…" : "更新"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                      キャンセル
                    </button>
                  </div>
                </section>
              )}

              {/* Customer List */}
              {!isFirstUse && (
                <section className="glass-card overflow-hidden">
                  <div className="border-b border-border-subtle p-5">
                    <div className="text-xs font-semibold tracking-[0.18em] text-muted">顧客一覧</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-surface-hover">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            顧客名
                          </th>
                          <th className="hidden sm:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            フリガナ
                          </th>
                          <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            メール
                          </th>
                          <th className="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            電話番号
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            証明書
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            登録日
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">
                            操作
                          </th>
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
                            <td className="px-5 py-3.5 whitespace-nowrap text-secondary">{formatDate(c.created_at)}</td>
                            <td className="px-5 py-3.5">
                              <MutationGuard fallback={<span className="text-xs text-muted">閲覧のみ</span>}>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    className="btn-ghost px-3 py-1 text-xs"
                                    onClick={() => startEdit(c)}
                                  >
                                    編集
                                  </button>
                                  {/* 削除は admin 以上（代表判断 2026-09-04）。編集は staff のままなので
                                      外側の MutationGuard とは別に、削除だけ入れ子で絞る。
                                      押せば必ず 403 になるボタンを見せない。 */}
                                  <MutationGuard minRole="admin">
                                    <button
                                      type="button"
                                      className="btn-danger px-3 py-1 text-xs"
                                      disabled={deletingId === c.id || c.certificates_count > 0 || c.invoices_count > 0}
                                      title={
                                        c.certificates_count > 0 || c.invoices_count > 0
                                          ? "証明書・請求書が紐付いているため削除できません"
                                          : ""
                                      }
                                      onClick={() => handleDelete(c.id)}
                                    >
                                      {deletingId === c.id ? "削除中…" : "削除"}
                                    </button>
                                  </MutationGuard>
                                </div>
                              </MutationGuard>
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
              )}
            </>
          );
        })()}
    </div>
  );
}
