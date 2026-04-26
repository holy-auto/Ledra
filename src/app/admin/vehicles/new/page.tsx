"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import ShakenshoScanner from "@/components/vehicles/ShakenshoScanner";

type Customer = { id: string; name: string; phone: string | null };

export default function AdminVehicleNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin/vehicles";
  const prefillCustomerId = searchParams.get("customer_id") ?? "";

  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plateDisplay, setPlateDisplay] = useState("");
  const [vinCode, setVinCode] = useState("");
  const [sizeClass, setSizeClass] = useState("");
  const [sizeAuto, setSizeAuto] = useState(false);
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  // インライン顧客作成
  const [inlineCreate, setInlineCreate] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [custCreateBusy, setCustCreateBusy] = useState(false);
  const [custCreateErr, setCustCreateErr] = useState<string | null>(null);

  // URL パラメータから顧客を事前選択
  useEffect(() => {
    if (!prefillCustomerId) return;
    fetch(`/api/admin/customers/${prefillCustomerId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.customer) {
          setCustomerId(j.customer.id);
          setCustomerSearch(j.customer.name);
          setCustomerName(j.customer.name);
        }
      })
      .catch(() => {});
  }, [prefillCustomerId]);

  function applyExtracted(x: {
    maker?: string | null;
    model?: string | null;
    year?: number | null;
    vin_code?: string | null;
    plate_display?: string | null;
    size_class?: string | null;
  }) {
    if (x.maker) setMaker(x.maker);
    if (x.model) setModel(x.model);
    if (x.year) setYear(String(x.year));
    if (x.vin_code) setVinCode(x.vin_code);
    if (x.plate_display) setPlateDisplay(x.plate_display);
    if (x.size_class) { setSizeClass(x.size_class); setSizeAuto(false); }
  }

  // メーカー/車種からサイズ自動判定
  const sizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!maker.trim() || !model.trim()) return;
    if (sizeDebounceRef.current) clearTimeout(sizeDebounceRef.current);
    sizeDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/vehicle-size?maker=${encodeURIComponent(maker)}&model=${encodeURIComponent(model)}`);
        const j = await res.json();
        if (j?.size_class) { setSizeClass(j.size_class); setSizeAuto(true); }
      } catch { /* ignore */ }
    }, 500);
  }, [maker, model]);

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return; }
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    customerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(customerSearch)}&limit=8`);
        const j = await res.json();
        setCustomerResults(j.customers ?? []);
      } catch { setCustomerResults([]); }
    }, 300);
  }, [customerSearch]);

  async function handleInlineCreateCustomer() {
    if (!newCustName.trim()) { setCustCreateErr("顧客名を入力してください"); return; }
    setCustCreateBusy(true);
    setCustCreateErr(null);
    try {
      const res = await fetch("/api/admin/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          email: newCustEmail.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setCustCreateErr(j?.message || "顧客の作成に失敗しました"); return; }
      const created: Customer = j.customer;
      setCustomerId(created.id);
      setCustomerName(created.name);
      setCustomerSearch(created.name);
      setInlineCreate(false);
      setNewCustName("");
      setNewCustPhone("");
      setNewCustEmail("");
    } catch (e: unknown) {
      setCustCreateErr(String((e as Error)?.message ?? e));
    } finally {
      setCustCreateBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/vehicles/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maker,
          model,
          year: year ? Number(year) : null,
          plate_display: plateDisplay || null,
          vin_code: vinCode || null,
          notes: notes || null,
          customer_id: customerId || null,
          size_class: sizeClass || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j?.message || "保存に失敗しました。"); return; }
      if (j?.id && returnTo === "/admin/vehicles") { router.push(`/admin/vehicles/${j.id}`); return; }
      router.push(returnTo);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onOcrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/vehicles/parse-shakken", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setErr(j?.message || "車検証の読み取りに失敗しました。"); return; }
      applyExtracted(j.extracted);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setOcrBusy(false);
      if (ocrInputRef.current) ocrInputRef.current.value = "";
    }
  }

  async function onScanResult(raw: string) {
    setScannerOpen(false);
    setOcrBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/vehicles/parse-shakken-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j?.message || "二次元コードの解析に失敗しました。画像アップロードをお試しください。"); return; }
      applyExtracted(j.extracted);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setOcrBusy(false);
    }
  }

  const inputCls = "input-field w-full";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">車両を登録</h1>
          <p className="text-sm text-muted">Ledra RECORD の車両マスターを登録します。</p>
        </div>

        {/* 車検証 OCR */}
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">車検証から自動入力</div>
          <p className="text-sm text-secondary mb-3">
            電子車検証の二次元コードをカメラで直接読むか、画像をアップロードするとメーカー・車種・年式・車体番号・ナンバー・サイズを自動入力します。
          </p>
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onOcrFileChange}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={ocrBusy} onClick={() => setScannerOpen(true)}>
              カメラでスキャン
            </Button>
            <Button type="button" variant="secondary" loading={ocrBusy} onClick={() => ocrInputRef.current?.click()}>
              {ocrBusy ? "読み取り中..." : "画像をアップロード"}
            </Button>
          </div>
        </div>

        <ShakenshoScanner open={scannerOpen} onResult={onScanResult} onClose={() => setScannerOpen(false)} />

        <form onSubmit={onSubmit} className="space-y-6 glass-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">メーカー *</div>
              <input value={maker} onChange={(e) => setMaker(e.target.value)} className={inputCls} required />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">車種 *</div>
              <input value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} required />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">年式</div>
              <input value={year} onChange={(e) => setYear(e.target.value)} className={inputCls} inputMode="numeric" placeholder="例: 2022" />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">ナンバー表示</div>
              <input value={plateDisplay} onChange={(e) => setPlateDisplay(e.target.value)} className={inputCls} placeholder="水戸 300 あ 12-34" />
            </label>

            <label className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium text-primary">車体番号（VINコード）</div>
              <input value={vinCode} onChange={(e) => setVinCode(e.target.value)} className={`${inputCls} font-mono`} placeholder="例: JF1GP7LD7EG000001" maxLength={50} />
            </label>
          </div>

          {/* 車両サイズ */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-primary">車両サイズ</div>
            <div className="flex gap-2 flex-wrap">
              {["SS", "S", "M", "L", "LL", "XL"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSizeClass(s); setSizeAuto(false); }}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    sizeClass === s
                      ? "border-accent bg-accent text-white"
                      : "border-border-default bg-surface text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {s}
                </button>
              ))}
              {sizeClass && (
                <button type="button" onClick={() => { setSizeClass(""); setSizeAuto(false); }} className="text-xs text-muted hover:text-red-500 ml-2">
                  クリア
                </button>
              )}
            </div>
            {sizeAuto && sizeClass && (
              <p className="text-[11px] text-success-text">✓ {maker} {model} → {sizeClass}（マスタから自動判定）</p>
            )}
            <p className="text-[11px] text-muted">SS=~8㎥, S=8~10㎥, M=10~12㎥, L=12~14㎥, LL=14~16㎥, XL=16㎥~（体積基準）</p>
          </div>

          {/* 顧客紐付け */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-primary">現所有者（顧客）</div>
            <div className="relative">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerId(null);
                  setCustomerName("");
                  setCustomerDropdownOpen(true);
                  setInlineCreate(false);
                }}
                onFocus={() => { if (customerSearch) setCustomerDropdownOpen(true); }}
                onBlur={() => setTimeout(() => setCustomerDropdownOpen(false), 200)}
                className={inputCls}
                placeholder="顧客名で検索..."
                autoComplete="off"
              />
              {customerId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-success-dim text-success-text px-1.5 py-0.5 rounded font-medium">
                  マスタ連携
                </span>
              )}

              {customerDropdownOpen && (customerResults.length > 0 || customerSearch.trim()) && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border-default bg-surface shadow-md">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={() => {
                          setCustomerId(c.id);
                          setCustomerName(c.name);
                          setCustomerSearch(c.name);
                          setCustomerDropdownOpen(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover"
                      >
                        <span className="font-medium text-primary">{c.name}</span>
                        {c.phone && <span className="ml-2 text-xs text-muted">{c.phone}</span>}
                      </button>
                    </li>
                  ))}
                  {/* 新規顧客作成オプション */}
                  {customerSearch.trim() && (
                    <li className="border-t border-border-subtle">
                      <button
                        type="button"
                        onMouseDown={() => {
                          setNewCustName(customerSearch.trim());
                          setInlineCreate(true);
                          setCustomerDropdownOpen(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-accent hover:bg-accent-dim flex items-center gap-2"
                      >
                        <span className="text-base leading-none">+</span>
                        <span>「{customerSearch}」を新規顧客として登録</span>
                      </button>
                    </li>
                  )}
                </ul>
              )}

              {customerId && (
                <button
                  type="button"
                  onClick={() => { setCustomerId(null); setCustomerSearch(""); setCustomerName(""); }}
                  className="mt-1 text-xs text-red-500 hover:underline"
                >
                  紐付けを解除
                </button>
              )}
            </div>

            {/* インライン顧客登録フォーム */}
            {inlineCreate && (
              <div className="rounded-xl border border-accent/30 bg-accent-dim p-4 space-y-3">
                <div className="text-sm font-semibold text-accent">新規顧客を登録</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-secondary">顧客名 *</span>
                    <input
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className={inputCls}
                      placeholder="山田 太郎"
                      autoFocus
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-secondary">電話番号</span>
                    <input
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className={inputCls}
                      placeholder="090-0000-0000"
                      inputMode="tel"
                    />
                  </label>
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs font-medium text-secondary">メールアドレス</span>
                    <input
                      value={newCustEmail}
                      onChange={(e) => setNewCustEmail(e.target.value)}
                      className={inputCls}
                      placeholder="example@email.com"
                      inputMode="email"
                    />
                  </label>
                </div>
                {custCreateErr && (
                  <p className="text-xs text-danger">{custCreateErr}</p>
                )}
                <div className="flex gap-2">
                  <Button type="button" loading={custCreateBusy} onClick={handleInlineCreateCustomer}>
                    登録して紐付ける
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => { setInlineCreate(false); setNewCustName(""); setNewCustPhone(""); setNewCustEmail(""); setCustCreateErr(null); }}>
                    キャンセル
                  </Button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted">顧客マスタから選択、または新規顧客を登録して紐付けできます（任意）</p>
          </div>

          <label className="space-y-2 block">
            <div className="text-sm font-medium text-primary">メモ</div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field min-h-[120px] w-full" />
          </label>

          {err && (
            <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
              {err}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" loading={busy}>保存する</Button>
            <Button type="button" variant="secondary" onClick={() => router.push(returnTo)}>キャンセル</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
