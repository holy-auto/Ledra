"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import HelpTooltip from "@/components/ui/HelpTooltip";

const ShakenshoScanner = dynamic(() => import("@/components/vehicles/ShakenshoScanner"), {
  ssr: false,
});

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin_code?: string | null;
  size_class?: string | null;
  customer_id?: string | null;
  customer?: { id: string; name: string } | null;
};

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type Extracted = {
  maker?: string | null;
  model?: string | null;
  year?: number | null;
  vin_code?: string | null;
  plate_display?: string | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  size_class?: string | null;
};

function vehicleLabel(v: Vehicle) {
  const parts: string[] = [];
  if (v.maker) parts.push(v.maker);
  if (v.model) parts.push(v.model);
  if (v.year) parts.push(String(v.year));
  const info = parts.join(" ");
  if (v.plate_display) return `${info}（${v.plate_display}）`;
  return info || "（名称なし）";
}

function vehicleModel(v: Vehicle) {
  return [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ");
}

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-secondary";

export default function VehiclePickerSection({
  vehicles: initialVehicles,
  customers: initialCustomers = [],
  defaultVehicleId,
  defaultCustomerId,
  onVehicleChange,
}: {
  vehicles: Vehicle[];
  customers?: Customer[];
  defaultVehicleId?: string;
  defaultCustomerId?: string;
  onVehicleChange?: (vehicleId: string | undefined) => void;
}) {
  const [vehicles] = useState<Vehicle[]>(initialVehicles);
  const [customers] = useState<Customer[]>(initialCustomers);
  const [selectedId, setSelectedId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  // 車検証OCR の所有者氏名から名寄せした連携候補 (confidence 0.85 未満で提示)。
  const [customerSuggestion, setCustomerSuggestion] = useState<{
    id: string;
    name: string;
    confidence: number;
  } | null>(null);
  const [model, setModel] = useState("");
  const [plate, setPlate] = useState("");
  const [maker, setMaker] = useState("");
  const [vinCode, setVinCode] = useState("");
  const [sizeClass, setSizeClass] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);

  // Shakensho auto-fill state
  const [scannerOpen, setScannerOpen] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Customer master search
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Vehicle search (combobox for maker field)
  const [vehicleSearchOpen, setVehicleSearchOpen] = useState(false);

  // Pre-select vehicle when defaultVehicleId is provided
  useEffect(() => {
    if (!defaultVehicleId) return;
    const v = vehicles.find((v) => v.id === defaultVehicleId);
    if (v) {
      setSelectedId(v.id);
      setMaker(v.maker ?? "");
      setModel(vehicleModel(v));
      setPlate(v.plate_display ?? "");
      setVinCode(v.vin_code ?? "");
      setSizeClass(v.size_class ?? null);
      if (v.customer) {
        setCustomerName(v.customer.name);
        setCustomerId(v.customer.id);
      }
      onVehicleChange?.(v.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultVehicleId]);

  // Pre-select customer when defaultCustomerId is provided (e.g. opened from a
  // customer/reservation flow). A pre-selected vehicle that carries its own
  // linked customer wins (that master link is more specific); otherwise seed
  // from defaultCustomerId so the submitted customer_id is not lost.
  useEffect(() => {
    if (!defaultCustomerId) return;
    const dv = defaultVehicleId ? vehicles.find((v) => v.id === defaultVehicleId) : null;
    if (dv?.customer) return;
    setCustomerId(defaultCustomerId);
    const c = customers.find((x) => x.id === defaultCustomerId);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCustomerId]);

  // Customer search debounce
  useEffect(() => {
    if (!customerSearch.trim()) {
      setCustomerResults([]);
      return;
    }
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current);
    customerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(customerSearch)}&limit=8`);
        const j = await res.json();
        setCustomerResults(j.customers ?? []);
      } catch {
        setCustomerResults([]);
      }
    }, 300);
  }, [customerSearch]);

  // Vehicle search — filter local list based on maker input.
  // Memoize so we don't re-iterate ~300 vehicles on every unrelated re-render
  // (this used to dominate INP while typing in other fields). Cap the visible
  // dropdown to avoid rendering hundreds of <li> nodes per keystroke.
  const VEHICLE_DROPDOWN_LIMIT = 50;
  const vehicleFiltered = useMemo(() => {
    const s = maker.trim().toLowerCase();
    if (!s) return vehicles.slice(0, VEHICLE_DROPDOWN_LIMIT);
    const matched: Vehicle[] = [];
    for (const v of vehicles) {
      const hit = [v.maker, v.model, v.plate_display, v.vin_code]
        .filter(Boolean)
        .some((val) => String(val).toLowerCase().includes(s));
      if (hit) {
        matched.push(v);
        if (matched.length >= VEHICLE_DROPDOWN_LIMIT) break;
      }
    }
    return matched;
  }, [vehicles, maker]);

  const handleVehicleSelect = (v: Vehicle) => {
    setSelectedId(v.id);
    setMaker(v.maker ?? "");
    setModel(vehicleModel(v));
    setPlate(v.plate_display ?? "");
    setVinCode(v.vin_code ?? "");
    setSizeClass(v.size_class ?? null);
    setVehicleSearchOpen(false);
    onVehicleChange?.(v.id);
    // Auto-fill customer if vehicle has one
    if (v.customer) {
      setCustomerName(v.customer.name);
      setCustomerId(v.customer.id);
      setCustomerSearch("");
    }
  };

  const handleVehicleClear = () => {
    setSelectedId("");
    setMaker("");
    onVehicleChange?.(undefined);
    setModel("");
    setPlate("");
    setVinCode("");
    setSizeClass(null);
  };

  const handleMakerChange = (val: string) => {
    setMaker(val);
    // Clear master link when user types freely
    if (selectedId) {
      setSelectedId("");
    }
    setVehicleSearchOpen(true);
  };

  const handleModelChange = (val: string) => {
    setModel(val);
    if (selectedId) {
      setSelectedId("");
    }
  };

  const handlePlateChange = (val: string) => {
    setPlate(val);
    if (selectedId) {
      setSelectedId("");
    }
  };

  const handleCustomerSelect = (c: Customer) => {
    setCustomerName(c.name);
    setCustomerId(c.id);
    setCustomerPhone(c.phone ?? null);
    setCustomerSearch("");
    setCustomerSearchOpen(false);
  };

  // Apply extracted data from QR scan or image OCR to form fields
  const applyExtracted = (extracted: Extracted) => {
    const filled: string[] = [];
    if (extracted.maker) {
      setMaker(extracted.maker);
      filled.push("メーカー");
    }
    if (extracted.model || extracted.maker) {
      const combined = [extracted.maker, extracted.model, extracted.year ? String(extracted.year) : null]
        .filter(Boolean)
        .join(" ");
      setModel(combined);
      if (extracted.model) filled.push("車種");
    }
    if (extracted.plate_display) {
      setPlate(extracted.plate_display);
      filled.push("ナンバー");
    }
    if (extracted.vin_code) {
      setVinCode(extracted.vin_code);
    }
    if (extracted.size_class) {
      setSizeClass(extracted.size_class);
    }
    // Clear master link since we're populating fields manually
    setSelectedId("");
    onVehicleChange?.(undefined);

    if (filled.length > 0) {
      setOcrMsg({ type: "success", text: `${filled.join("・")}を自動入力しました` });
    } else {
      setOcrMsg({ type: "error", text: "車両情報を読み取れませんでした。手入力してください。" });
    }
    setTimeout(() => setOcrMsg(null), 5000);
  };

  const handleQrResult = async (rawText: string) => {
    setScannerOpen(false);
    setOcrLoading(true);
    setOcrMsg(null);
    try {
      const res = await fetch("/api/vehicles/parse-shakken-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: rawText }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setOcrMsg({ type: "error", text: json.message ?? "二次元コードの解析に失敗しました" });
        return;
      }
      applyExtracted(json.extracted as Extracted);
    } catch {
      setOcrMsg({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setOcrLoading(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    setOcrLoading(true);
    setOcrMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/vehicles/parse-shakken", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setOcrMsg({ type: "error", text: json.message ?? "画像の読み取りに失敗しました" });
        return;
      }
      applyExtracted(json.extracted as Extracted);
      applyCustomerSuggestion(json.customer_suggestion);
    } catch {
      setOcrMsg({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setOcrLoading(false);
    }
  };

  // 車検証OCR が返した顧客連携候補を反映する。
  // confidence >= 0.85 は自動連携、未満は候補チップで確認を促す。
  // 既に顧客が選択済みのときは上書きしない。
  const applyCustomerSuggestion = (sug: { id: string; name: string; confidence: number } | null | undefined) => {
    if (!sug || customerId) return;
    if (sug.confidence >= 0.85) {
      setCustomerName(sug.name);
      setCustomerId(sug.id);
      setCustomerSuggestion(null);
      setOcrMsg({ type: "success", text: `所有者「${sug.name}」を自動連携しました` });
      setTimeout(() => setOcrMsg(null), 5000);
    } else {
      setCustomerSuggestion(sug);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── 車検証から自動入力 ── */}
      <div className="rounded-xl border border-border-default bg-surface p-4 space-y-3">
        <div>
          <div className="text-sm font-medium text-secondary">車検証から自動入力</div>
          <p className="mt-0.5 text-xs text-muted">
            電子車検証の二次元コードをスキャン、または画像をアップロードして車両情報を自動入力できます
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            disabled={ocrLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm font-medium text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"
              />
            </svg>
            カメラでスキャン
          </button>
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={ocrLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm font-medium text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            画像をアップロード
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
              e.target.value = "";
            }}
          />
        </div>

        {ocrLoading && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <svg
              className="h-3.5 w-3.5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            読み取り中...
          </div>
        )}

        {ocrMsg && (
          <p className={`text-xs ${ocrMsg.type === "success" ? "text-success-text" : "text-danger"}`}>
            {ocrMsg.type === "success" ? "✓ " : "✕ "}
            {ocrMsg.text}
          </p>
        )}

        {sizeClass && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>サイズ判定:</span>
            <span className="rounded-md bg-accent-dim px-2 py-0.5 text-xs font-semibold text-accent">{sizeClass}</span>
            <span className="text-[11px]">（証明書の料金計算に使用されます）</span>
          </div>
        )}
      </div>

      {/* Scanner modal (dynamically loaded) */}
      <ShakenshoScanner open={scannerOpen} onResult={handleQrResult} onClose={() => setScannerOpen(false)} />

      {/* Vehicle info section */}
      <div>
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">VEHICLE INFO</div>
          <div className="mt-1 text-base font-semibold text-primary inline-flex items-center gap-1.5">
            車両情報
            <HelpTooltip>
              既存車両を検索して選ぶか、車検証OCR・手入力で新規登録できます。証明書発行と同時に車両マスタにも保存されるため、次回以降は検索だけで呼び出せます。
            </HelpTooltip>
          </div>
          <p className="mt-0.5 text-xs text-muted">車両マスタから選択、または手入力してください</p>
        </div>

        <input type="hidden" name="vehicle_id" value={selectedId} />
        <input type="hidden" name="vehicle_maker" value={maker} />
        <input type="hidden" name="vin_code" value={vinCode} />
        <input type="hidden" name="size_class" value={sizeClass ?? ""} />

        <div className="space-y-4">
          {/* 登録済み車両から選択（プルダウン）— DB連携内容を一覧から確認・選択できる */}
          {vehicles.length > 0 && (
            <label className={labelCls}>
              <span className={labelTextCls}>登録済み車両から選択（プルダウン）</span>
              <select
                value={selectedId}
                onChange={(e) => {
                  const v = vehicles.find((x) => x.id === e.target.value);
                  if (v) handleVehicleSelect(v);
                  else handleVehicleClear();
                }}
                className={inputCls}
              >
                <option value="">― 手入力 / 未選択 ―</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                    {v.customer ? ` / ${v.customer.name}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                車両マスタから選ぶと連携内容を確認できます。未登録の車両は下の欄に手入力してください。
              </p>
            </label>
          )}

          {/* Maker — combobox: type to search or manual entry */}
          <div className={labelCls}>
            <span className={labelTextCls}>
              メーカー <span className="text-red-500">*</span>
            </span>
            <div className="relative">
              <input
                name="maker_display"
                value={maker}
                onChange={(e) => handleMakerChange(e.target.value)}
                onFocus={() => setVehicleSearchOpen(true)}
                onBlur={() => setTimeout(() => setVehicleSearchOpen(false), 200)}
                className={inputCls}
                placeholder="メーカーを入力 or 車両マスタから選択"
                autoComplete="off"
              />
              {selectedId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-success-dim text-success-text px-1.5 py-0.5 rounded font-medium">
                  マスタ連携
                </span>
              )}
              {vehicleSearchOpen && !selectedId && vehicleFiltered.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border-default bg-surface shadow-md">
                  {vehicleFiltered.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleVehicleSelect(v)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover"
                      >
                        <span className="font-medium text-primary">{vehicleLabel(v)}</span>
                        {v.customer && <span className="ml-2 text-xs text-success-text">{v.customer.name}</span>}
                        {v.vin_code && <span className="ml-2 text-xs text-muted font-mono">{v.vin_code}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-muted">入力すると車両マスタを検索します。手入力のみでもOK</p>
            </div>
          </div>

          {/* Selected vehicle banner (when linked to master) */}
          {selectedId && (
            <div className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-dim px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-success-text truncate">
                  {vehicleLabel(vehicles.find((v) => v.id === selectedId)!)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleVehicleClear}
                className="shrink-0 rounded-lg border border-success/30 bg-success-dim px-3 py-1 text-xs font-medium text-success-text hover:bg-success/15"
              >
                マスタ連携を解除
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              <span className={labelTextCls}>車種</span>
              <input
                name="model"
                value={model}
                onChange={(e) => handleModelChange(e.target.value)}
                className={inputCls}
                placeholder="Toyota Prius"
              />
            </label>
            <label className={labelCls}>
              <span className={labelTextCls}>ナンバー</span>
              <input
                name="plate"
                value={plate}
                onChange={(e) => handlePlateChange(e.target.value)}
                className={inputCls}
                placeholder="水戸 300 あ 12-34"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Basic info — customer */}
      <div className="border-t border-border-subtle pt-4">
        <div className="mb-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">BASIC INFO</div>
          <div className="mt-1 text-base font-semibold text-primary">基本情報</div>
        </div>

        <div className="space-y-4">
          {/* 登録済み顧客から選択（プルダウン）— DB連携内容を一覧から確認・選択できる */}
          {customers.length > 0 && (
            <label className={labelCls}>
              <span className={labelTextCls}>登録済み顧客から選択（プルダウン）</span>
              <select
                value={customerId}
                onChange={(e) => {
                  const c = customers.find((x) => x.id === e.target.value);
                  if (c) {
                    handleCustomerSelect(c);
                  } else {
                    setCustomerId("");
                    setCustomerName("");
                    setCustomerPhone(null);
                  }
                }}
                className={inputCls}
              >
                <option value="">― 手入力 / 未選択 ―</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                顧客マスタから選ぶと連携内容を確認できます。未登録の顧客は下の欄に手入力してください。
              </p>
            </label>
          )}

          {/* Customer name — combobox: type to search or manual entry */}
          <div className={labelCls}>
            <span className={labelTextCls}>
              お客様名 <span className="text-red-500">*</span>
            </span>
            <div className="relative">
              <input type="hidden" name="customer_id" value={customerId} />
              <input
                name="customer_name"
                value={customerName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerName(val);
                  setCustomerId("");
                  setCustomerPhone(null);
                  setCustomerSearch(val);
                  setCustomerSearchOpen(true);
                }}
                onFocus={() => {
                  if (customerName) {
                    setCustomerSearch(customerName);
                  }
                  setCustomerSearchOpen(true);
                }}
                onBlur={() => setTimeout(() => setCustomerSearchOpen(false), 200)}
                className={inputCls}
                placeholder="顧客名を入力 or 顧客マスタから選択"
                required
                autoComplete="off"
              />
              {customerId && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-success-dim text-success-text px-1.5 py-0.5 rounded font-medium">
                  マスタ連携
                </span>
              )}
              {customerSearchOpen && customerResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border-default bg-surface shadow-md">
                  {customerResults.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleCustomerSelect(c)}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover"
                      >
                        <span className="font-medium text-primary">{c.name}</span>
                        {c.phone && <span className="ml-2 text-xs text-muted">{c.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {customerSuggestion && !customerId && (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-accent/30 bg-accent-dim px-3 py-2 text-xs text-primary">
                  <span>
                    車検証の所有者候補: <span className="font-semibold">{customerSuggestion.name}</span>（一致度
                    {Math.round(customerSuggestion.confidence * 100)}%）
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerName(customerSuggestion.name);
                      setCustomerId(customerSuggestion.id);
                      setCustomerSuggestion(null);
                    }}
                    className="ml-auto rounded-md bg-accent px-2 py-1 font-medium text-white hover:opacity-90"
                  >
                    連携する
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerSuggestion(null)}
                    className="rounded-md border border-border-default px-2 py-1 text-muted hover:bg-surface-hover"
                  >
                    閉じる
                  </button>
                </div>
              )}
              {customerPhone ? (
                <p className="mt-1 text-[11px] text-muted">
                  電話番号: <span className="font-medium text-secondary">{customerPhone}</span>
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted">入力すると顧客マスタを検索します。手入力のみでもOK</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
