"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import QRCode from "qrcode";
import { fetcher } from "@/lib/swr";
import { formatJpy, formatDate } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import FirstUseInlineGuide from "@/components/ui/FirstUseInlineGuide";
import { InventoryWarningsBanner } from "@/components/pos/InventoryWarningsBanner";
import PosInventoryDeductPanel from "./PosInventoryDeductPanel";
import { menuCategoriesOf, filterMenuItems } from "@/lib/reservations/menuFilter";

/* ────────────────────────────────────────────── */
/*  Types                                         */
/* ────────────────────────────────────────────── */

type PosMode = "reservation" | "walkin" | "invoice";

interface Reservation {
  id: string;
  title: string;
  status: string;
  payment_status: string | null;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  estimated_amount: number | null;
  customer_name: string | null;
  customer_id: string | null;
  vehicle_info: string | null;
  vehicle_id: string | null;
  menu_items_json: MenuItem[] | null;
  note: string | null;
}

interface MenuItem {
  menu_item_id?: string;
  name: string;
  unit_price?: number;
  price?: number;
  quantity?: number;
}

interface ReservationsData {
  reservations: Reservation[];
  stats?: { total?: number; today?: number; active?: number };
}

interface MasterMenuItem {
  id: string;
  name: string;
  unit_price: number;
  tax_category: string | null;
  is_active: boolean;
  unit: string | null;
  category_large: string | null;
}

interface MenuItemsData {
  items: MasterMenuItem[];
}

interface CartItem {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  amount: number;
}

interface CheckoutResult {
  payment_id: string;
  document_id: string | null;
  amount: number;
  change: number;
  doc_number: string | null;
  status: string;
}

interface InvoiceSummary {
  id: string;
  doc_number: string;
  recipient_name: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  total: number;
  subtotal: number;
  tax: number;
  tax_rate: number | null;
  status: string;
  issued_at: string | null;
  due_date: string | null;
  items_json: Array<{ description: string; quantity: number; unit_price: number; amount: number }> | null;
}

/* ────────────────────────────────────────────── */
/*  QR Code payment types                         */
/* ────────────────────────────────────────────── */
type QrStep = "idle" | "creating" | "showing" | "paid" | "recording" | "error";

/* ────────────────────────────────────────────── */
/*  Constants                                     */
/* ────────────────────────────────────────────── */

const PAYMENT_METHODS = [
  { value: "cash", label: "現金", icon: "💴" },
  { value: "card", label: "カード", icon: "💳" },
  { value: "qr", label: "QR決済", icon: "📱" },
  { value: "bank_transfer", label: "振込", icon: "🏦" },
  { value: "other", label: "その他", icon: "📋" },
] as const;

const RESERVATION_STATUS_MAP: Record<
  string,
  { variant: "default" | "success" | "warning" | "danger" | "info" | "violet"; label: string }
> = {
  confirmed: { variant: "info", label: "確定" },
  arrived: { variant: "violet", label: "来店" },
  in_progress: { variant: "warning", label: "作業中" },
  completed: { variant: "success", label: "完了" },
  cancelled: { variant: "default", label: "取消" },
};

const PAYMENT_STATUS_MAP: Record<
  string,
  { variant: "default" | "success" | "warning" | "danger" | "info" | "violet"; label: string }
> = {
  unpaid: { variant: "default", label: "未会計" },
  paid: { variant: "success", label: "会計済" },
  partial: { variant: "warning", label: "一部" },
  refunded: { variant: "danger", label: "返金済" },
};

/* ────────────────────────────────────────────── */
/*  Component                                     */
/* ────────────────────────────────────────────── */

export default function PosClient() {
  // ── Mode ──
  const [mode, setMode] = useState<PosMode>("reservation");

  // ── Data fetch: Reservations ──
  const { data, isLoading, mutate } = useSWR<ReservationsData>(
    "/api/admin/reservations?status=arrived,in_progress,completed&limit=200",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 12_000 + Math.floor(Math.random() * 6_000), keepPreviousData: true },
  );

  const reservations = data?.reservations ?? [];

  const unpaidReservations = useMemo(
    () => reservations.filter((r) => !r.payment_status || r.payment_status === "unpaid"),
    [reservations],
  );

  const paidReservations = useMemo(() => reservations.filter((r) => r.payment_status === "paid"), [reservations]);

  // ── Data fetch: Menu items (walk-in) ──
  const { data: menuData, isLoading: menuLoading } = useSWR<MenuItemsData>(
    mode === "walkin" ? "/api/admin/menu-items" : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const masterMenuItems = useMemo(() => (menuData?.items ?? []).filter((mi) => mi.is_active), [menuData]);

  // ── State ──
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategory, setMenuCategory] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Invoice mode state ──
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceSearchBusy, setInvoiceSearchBusy] = useState(false);
  const [invoiceSearchError, setInvoiceSearchError] = useState<string | null>(null);
  const [loadedInvoice, setLoadedInvoice] = useState<InvoiceSummary | null>(null);

  // ── QR Code payment state ──
  const [qrStep, setQrStep] = useState<QrStep>("idle");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  // 決済は済んだが記録に失敗したセッション。**これがある間は新しいQRを出させない**
  // （出すと客が二重に請求される）
  const [pendingRecordSessionId, setPendingRecordSessionId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Mode switch reset ──
  const handleModeSwitch = useCallback((newMode: PosMode) => {
    setMode(newMode);
    setSelected(null);
    setCart([]);
    setMenuSearch("");
    setMenuCategory(null);
    setResult(null);
    setError(null);
    setPaymentMethod("cash");
    setReceivedAmount("");
    setNote("");
    setQrStep("idle");
    setQrDataUrl(null);
    setQrSessionId(null);
    setQrError(null);
    setInvoiceSearch("");
    setInvoiceSearchError(null);
    setLoadedInvoice(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ── Invoice search ──
  const handleInvoiceSearch = useCallback(async () => {
    const q = invoiceSearch.trim();
    if (!q) return;
    setInvoiceSearchBusy(true);
    setInvoiceSearchError(null);
    setLoadedInvoice(null);
    try {
      const res = await fetch(`/api/admin/invoices?doc_number=${encodeURIComponent(q)}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      if (!j.found) {
        setInvoiceSearchError(`「${q}」が見つかりません`);
        return;
      }
      if (j.invoice.status === "paid") {
        setInvoiceSearchError(`「${q}」はすでに入金済みです`);
        return;
      }
      if (j.invoice.status === "cancelled") {
        setInvoiceSearchError(`「${q}」はキャンセル済みです`);
        return;
      }
      setLoadedInvoice(j.invoice);
    } catch (e) {
      setInvoiceSearchError(e instanceof Error ? e.message : "検索に失敗しました");
    } finally {
      setInvoiceSearchBusy(false);
    }
  }, [invoiceSearch]);

  // ── Filtered menu items（検索 + 大カテゴリ絞り込み。予約作成と同じ純関数を再利用） ──
  const menuCategories = useMemo(() => menuCategoriesOf(masterMenuItems), [masterMenuItems]);
  const filteredMenuItems = useMemo(
    () => filterMenuItems(masterMenuItems, menuSearch, menuCategory),
    [masterMenuItems, menuSearch, menuCategory],
  );

  // ── Cart helpers ──
  const addToCart = useCallback((mi: MasterMenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === mi.id);
      if (existing) {
        return prev.map((c) =>
          c.id === mi.id ? { ...c, quantity: c.quantity + 1, amount: (c.quantity + 1) * c.unit_price } : c,
        );
      }
      return [...prev, { id: mi.id, name: mi.name, unit_price: mi.unit_price, quantity: 1, amount: mi.unit_price }];
    });
  }, []);

  const updateCartQty = useCallback((id: string, delta: number) => {
    setCart(
      (prev) =>
        prev
          .map((c) => {
            if (c.id !== id) return c;
            const newQty = c.quantity + delta;
            if (newQty <= 0) return null;
            return { ...c, quantity: newQty, amount: newQty * c.unit_price };
          })
          .filter(Boolean) as CartItem[],
    );
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  // ── Checkout items (unified) ──
  const checkoutItems = useMemo(() => {
    if (mode === "walkin") {
      return cart.map((c) => ({
        description: c.name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        amount: c.amount,
      }));
    }
    if (mode === "invoice") {
      return (loadedInvoice?.items_json ?? []).map((item) => ({
        description: item.description ?? "",
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? 0,
        amount: item.amount ?? 0,
      }));
    }
    // reservation mode
    if (!selected?.menu_items_json) return [];
    return selected.menu_items_json.map((mi) => ({
      description: mi.name,
      quantity: mi.quantity ?? 1,
      unit_price: mi.unit_price ?? mi.price ?? 0,
      amount: (mi.quantity ?? 1) * (mi.unit_price ?? mi.price ?? 0),
    }));
  }, [mode, cart, selected, loadedInvoice]);

  // ── Computed ──
  const amount = useMemo(() => {
    if (mode === "walkin") return cart.reduce((s, c) => s + c.amount, 0);
    if (mode === "invoice") return loadedInvoice?.total ?? 0;
    return selected?.estimated_amount ?? 0;
  }, [mode, cart, selected, loadedInvoice]);

  const received = receivedAmount ? parseInt(receivedAmount, 10) : amount;
  const change = paymentMethod === "cash" ? Math.max(0, received - amount) : 0;
  const hasSelection = mode === "reservation" ? !!selected : mode === "invoice" ? !!loadedInvoice : cart.length > 0;
  const canCheckout = amount > 0 && !processing && (paymentMethod !== "cash" || received >= amount);

  // Reset form when selection changes (reservation mode)
  useEffect(() => {
    if (mode !== "reservation") return;
    setPaymentMethod("cash");
    setReceivedAmount("");
    setNote("");
    setResult(null);
    setError(null);
    setQrStep("idle");
    setQrDataUrl(null);
    setQrSessionId(null);
    setQrError(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [selected?.id, mode]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  /**
   * 決済済みの Checkout Session を Ledra に記録する。
   *
   * **ポーリングの完了時と、記録に失敗した後のやり直しの両方から呼ぶ。**
   * やり直しで新しいセッションを作ると**客が二重に請求される**ので、
   * 同じ `sessionId` を送り直す（サーバが PaymentIntent で1件に抑える）。
   */
  const recordQrSale = useCallback(
    async (sessionId: string) => {
      setQrError(null);
      setQrStep("recording");
      try {
        const checkoutRes = await fetch("/api/admin/pos/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reservation_id: mode === "reservation" ? selected?.id : undefined,
            customer_id:
              mode === "reservation"
                ? selected?.customer_id
                : mode === "invoice"
                  ? (loadedInvoice?.customer_id ?? undefined)
                  : undefined,
            payment_method: "card",
            amount,
            items_json: checkoutItems,
            tax_rate: 10,
            note: note || undefined,
            // 同じ決済で2件目を作らせない。**サーバがこのセッションを Stripe から
            // 取り直して**支払済みと金額を確かめる（こちらの申告は信じない）
            checkout_session_id: sessionId,
            create_receipt: true,
          }),
        });
        const checkoutData = await checkoutRes.json();
        if (!checkoutRes.ok)
          throw new Error(checkoutData?.message ?? checkoutData?.error ?? "決済の記録に失敗しました");

        // 応答は { ok, result, inventory }。封筒のまま入れると
        // 会計完了パネルが「お会計 -」・領収書番号なしになる
        setResult(checkoutData.result ?? checkoutData);
        setPendingRecordSessionId(null);

        if (mode === "invoice" && loadedInvoice) {
          const payRes = await fetch("/api/admin/invoices", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: loadedInvoice.id,
              status: "paid",
              payment_date: new Date().toISOString().slice(0, 10),
            }),
          });
          // 決済は完了しているため、入金ステータス更新の失敗は握り潰さず可視化する
          if (!payRes.ok) {
            setQrError(
              "決済は完了しましたが、請求書の入金ステータス更新に失敗しました。請求書一覧から手動で入金処理してください。",
            );
          }
        }
        setQrStep("idle");
        await mutate();
      } catch (e) {
        // **決済は済んでいる。**「記録中...」のまま止めると、店員はカードが
        // 切られたことにも失敗にも気づけない。やり直せる状態にして見せる
        setPendingRecordSessionId(sessionId);
        setQrError(
          (e instanceof Error ? e.message : "決済の記録に失敗しました") +
            "（カードは決済済みです。「記録をやり直す」を押してください。新しくQRを出すと二重に請求されます）",
        );
        setQrStep("error");
      }
    },
    [mode, selected, loadedInvoice, amount, checkoutItems, note, mutate],
  );

  // ── QR Code card payment flow ──
  const handleCardPaymentQr = useCallback(async () => {
    setQrStep("creating");
    setQrError(null);
    setPendingRecordSessionId(null);
    setQrDataUrl(null);
    setQrSessionId(null);

    try {
      // 1. Checkout Session 作成
      const description =
        checkoutItems.map((i) => i.description).join(", ") ||
        (mode === "reservation" ? selected?.title : "ウォークイン会計") ||
        "POS会計";
      const res = await fetch("/api/admin/pos/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description,
          reservation_id: mode === "reservation" ? selected?.id : undefined,
          customer_id:
            mode === "reservation"
              ? selected?.customer_id
              : mode === "invoice"
                ? (loadedInvoice?.customer_id ?? undefined)
                : undefined,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? "Checkout Session の作成に失敗しました");

      const sessionId = data.session_id as string;
      const checkoutUrl = data.url as string;

      // 2. QRコード生成
      const qrUrl = await QRCode.toDataURL(checkoutUrl, {
        width: 250,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      setQrSessionId(sessionId);
      setQrDataUrl(qrUrl);
      setQrStep("showing");

      // 3. ポーリング開始 (2秒間隔, 最大5分)
      let attempts = 0;
      const maxAttempts = 150; // 5分 = 150 x 2秒
      // 通信が2秒より遅いと tick が重なる。`clearInterval` だけでは、既に走り出した
      // 回を止められず **2回記録してしまう**
      let done = false;

      pollingRef.current = setInterval(async () => {
        if (done) return;
        attempts++;
        if (attempts > maxAttempts) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setQrError("決済がタイムアウトしました。もう一度お試しください。");
          setQrStep("error");
          return;
        }

        try {
          const statusRes = await fetch(`/api/admin/pos/checkout-session?id=${sessionId}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();

          if (statusData.payment_status === "paid") {
            done = true;
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setQrStep("paid");

            // 4. Ledra DB に記録（失敗しても同じセッションでやり直せる）
            await recordQrSale(sessionId);
          } else if (statusData.status === "expired") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            setQrError("セッションが期限切れになりました。もう一度お試しください。");
            setQrStep("error");
          }
        } catch {
          // ポーリング中のネットワークエラーは無視して次回リトライ。
          // 記録の失敗は recordQrSale の中で拾って画面に出す
        }
      }, 2000);
    } catch (e) {
      setQrError(e instanceof Error ? e.message : "QRコードの生成に失敗しました");
      setQrStep("error");
    }
    // recordQrSale を入れないと、古い金額・明細のまま記録してしまう
  }, [selected, loadedInvoice, amount, checkoutItems, note, mutate, mode, recordQrSale]);

  // ── Cancel QR payment ──
  const handleCancelQr = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setQrStep("idle");
    setQrDataUrl(null);
    setQrSessionId(null);
    setQrError(null);
    setPendingRecordSessionId(null);
    setProcessing(false);
  }, []);

  // ── Main checkout handler ──
  const handleCheckout = useCallback(async () => {
    if (!hasSelection || processing) return;

    // カード決済: QRコードフロー
    if (paymentMethod === "card") {
      setProcessing(true);
      setError(null);
      await handleCardPaymentQr();
      setProcessing(false);
      return;
    }

    // 現金・QR・振込・その他: 即 pos_checkout
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: mode === "reservation" ? selected?.id : undefined,
          customer_id:
            mode === "reservation"
              ? selected?.customer_id
              : mode === "invoice"
                ? (loadedInvoice?.customer_id ?? undefined)
                : undefined,
          payment_method: paymentMethod,
          amount,
          received_amount: paymentMethod === "cash" ? received : undefined,
          items_json: checkoutItems,
          tax_rate: 10,
          note: note || undefined,
          create_receipt: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setResult(j.result ?? j);
      if (mode === "invoice" && loadedInvoice) {
        const payRes = await fetch("/api/admin/invoices", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: loadedInvoice.id,
            status: "paid",
            payment_date: new Date().toISOString().slice(0, 10),
          }),
        });
        // 決済は完了しているため、入金ステータス更新の失敗は握り潰さず可視化する
        if (!payRes.ok) {
          setError(
            "決済は完了しましたが、請求書の入金ステータス更新に失敗しました。請求書一覧から手動で入金処理してください。",
          );
        }
      }
      await mutate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "会計処理に失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [
    hasSelection,
    processing,
    paymentMethod,
    amount,
    received,
    checkoutItems,
    note,
    mutate,
    mode,
    selected,
    loadedInvoice,
    handleCardPaymentQr,
  ]);

  // ── Render ──
  return (
    <div className="space-y-6">
      <PageHeader
        title="POS 会計"
        tag="POS"
        description="予約の会計処理・ウォークイン会計を行います"
        tabs={[
          { key: "reservation", label: "予約から会計" },
          { key: "walkin", label: "予約なし会計" },
          { key: "invoice", label: "請求書から会計" },
        ]}
        activeTab={mode}
        onTabSelect={(k) => handleModeSwitch(k as PosMode)}
      />

      <FirstUseInlineGuide
        storageKey="pos"
        title="POS会計の使い方"
        description="店頭での現金・カード会計を Ledra 上で完結させる機能です。Stripe Terminal を接続するとカード決済の電子化もできます。"
        steps={[
          {
            title: "レジを開局",
            description: "1日の営業開始時に「レジを開局」を押し、開始時の現金残高を入力。閉局時に売上突合します。",
          },
          {
            title: "会計対象を選ぶ",
            description: "未会計の予約一覧から対象をクリック、もしくは「ウォークイン会計」でその場で品目入力できます。",
          },
          {
            title: "決済方法を選択して完了",
            description: "現金・カード (Stripe Terminal) ・QR・銀行振込から選択。完了後は領収書がメール送信できます。",
          },
        ]}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="未会計" value={unpaidReservations.length} />
        <StatCard label="本日会計済" value={paidReservations.length} />
        <StatCard
          label="本日売上"
          value={formatJpy(paidReservations.reduce((s, r) => s + (r.estimated_amount ?? 0), 0))}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left panel ── */}
        <div className="flex-1 space-y-3">
          {mode === "reservation" ? (
            /* ── Reservation list ── */
            <>
              <h2 className="text-sm font-semibold text-secondary">{"未会計の予約"}</h2>

              {isLoading && !data ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-hover" />
                  ))}
                </div>
              ) : unpaidReservations.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-surface p-8 text-center text-sm text-muted">
                  {"未会計の予約はありません"}
                </div>
              ) : (
                <div className="space-y-2">
                  {unpaidReservations.map((r) => {
                    const isSelected = selected?.id === r.id;
                    const statusEntry = RESERVATION_STATUS_MAP[r.status] ?? {
                      variant: "default" as const,
                      label: r.status,
                    };
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelected(isSelected ? null : r)}
                        className={`w-full rounded-xl border p-4 text-left transition-all ${
                          isSelected
                            ? "border-accent bg-accent-dim shadow-sm"
                            : "border-border-subtle bg-surface hover:border-border hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-primary">{r.title || "無題"}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={statusEntry.variant}>{statusEntry.label}</Badge>
                            <span className="text-sm font-semibold text-primary">{formatJpy(r.estimated_amount)}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
                          {r.scheduled_date && <span>{formatDate(r.scheduled_date)}</span>}
                          {r.start_time && (
                            <span>
                              {r.start_time}
                              {"〜"}
                              {r.end_time ?? ""}
                            </span>
                          )}
                          {r.customer_name && <span>{r.customer_name}</span>}
                          {r.vehicle_info && <span>{r.vehicle_info}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : mode === "invoice" ? (
            /* ── Invoice lookup ── */
            <>
              <h2 className="text-sm font-semibold text-secondary">{"請求書番号で読み込む"}</h2>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleInvoiceSearch();
                  }}
                  placeholder="例: INV-202604-001"
                  className="flex-1 rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={handleInvoiceSearch}
                  disabled={invoiceSearchBusy || !invoiceSearch.trim()}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {invoiceSearchBusy ? "検索中..." : "検索"}
                </button>
              </div>

              {invoiceSearchError && (
                <div className="rounded-xl bg-danger-dim px-4 py-2.5 text-sm text-danger-text">
                  {invoiceSearchError}
                </div>
              )}

              {loadedInvoice && (
                <div className="rounded-xl border border-accent bg-accent-dim p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wider text-muted">{"請求書"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadedInvoice(null);
                        setInvoiceSearch("");
                      }}
                      className="text-xs text-muted hover:text-danger-text"
                    >
                      {"クリア"}
                    </button>
                  </div>
                  <div className="text-sm font-semibold text-primary">{loadedInvoice.doc_number}</div>
                  {loadedInvoice.recipient_name && (
                    <div className="text-xs text-secondary">{loadedInvoice.recipient_name}</div>
                  )}
                  {(loadedInvoice.items_json ?? []).length > 0 && (
                    <div className="space-y-1">
                      {(loadedInvoice.items_json ?? []).map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="text-secondary">
                            {item.description}
                            {item.quantity > 1 && <span className="ml-1 text-muted">x{item.quantity}</span>}
                          </span>
                          <span className="font-medium text-primary">{formatJpy(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-accent/30 pt-2 text-sm font-bold">
                    <span className="text-accent">{"合計"}</span>
                    <span className="text-accent">{formatJpy(loadedInvoice.total)}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* ── Walk-in: menu item grid ── */
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-secondary">{"品目を選択"}</h2>
                {cart.length > 0 && (
                  <button type="button" onClick={clearCart} className="text-xs text-danger-text hover:underline">
                    {"カートを空にする"}
                  </button>
                )}
              </div>

              {/* Search */}
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder={"品目名で検索..."}
                className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />

              {/* カテゴリ絞り込み（品目マスタが多いと選びにくいため） */}
              {menuCategories.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMenuCategory(null)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                      menuCategory === null
                        ? "border-accent bg-accent-dim text-accent-text"
                        : "border-border-subtle bg-surface text-secondary hover:border-border"
                    }`}
                  >
                    {"すべて"}
                  </button>
                  {menuCategories.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMenuCategory(c)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                        menuCategory === c
                          ? "border-accent bg-accent-dim text-accent-text"
                          : "border-border-subtle bg-surface text-secondary hover:border-border"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* Cart summary */}
              {cart.length > 0 && (
                <div className="space-y-1 rounded-xl border border-accent bg-accent-dim p-3">
                  <span className="text-xs font-medium text-accent">
                    {"カート"} ({cart.length} {"品目"})
                  </span>
                  {cart.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="text-primary">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCartQty(c.id, -1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-border-subtle bg-surface text-xs font-bold text-secondary hover:bg-surface-hover"
                        >
                          -
                        </button>
                        <span className="w-6 text-center text-xs font-semibold">{c.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(c.id, 1)}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-border-subtle bg-surface text-xs font-bold text-secondary hover:bg-surface-hover"
                        >
                          +
                        </button>
                        <span className="ml-1 w-16 text-right text-xs font-medium">{formatJpy(c.amount)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-accent/30 pt-1 text-sm font-semibold">
                    <span className="text-accent">{"合計"}</span>
                    <span className="text-accent">{formatJpy(amount)}</span>
                  </div>
                </div>
              )}

              {/* Menu item grid */}
              {menuLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-hover" />
                  ))}
                </div>
              ) : masterMenuItems.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-surface p-8 text-center text-sm text-muted">
                  {"品目マスタが登録されていません"}
                </div>
              ) : filteredMenuItems.length === 0 ? (
                <div className="rounded-xl border border-border-subtle bg-surface p-8 text-center text-sm text-muted">
                  {"該当する品目がありません"}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {filteredMenuItems.map((mi) => {
                    const inCart = cart.find((c) => c.id === mi.id);
                    return (
                      <button
                        key={mi.id}
                        type="button"
                        onClick={() => addToCart(mi)}
                        className={`relative rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                          inCart ? "border-accent bg-accent-dim" : "border-border-subtle bg-surface hover:border-border"
                        }`}
                      >
                        <div className="text-sm font-medium text-primary leading-tight">{mi.name}</div>
                        <div className="mt-1 text-xs font-semibold text-secondary">{formatJpy(mi.unit_price)}</div>
                        {inCart && (
                          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                            {inCart.quantity}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right: Checkout panel ── */}
        <div className="w-full lg:w-96">
          <div className="sticky top-6 space-y-4">
            {result ? (
              /* ── Success ── */
              <div className="glass-card space-y-4 rounded-2xl p-6">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success-dim">
                    <svg
                      width="28"
                      height="28"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="text-success-text"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-primary">{"会計完了"}</h3>
                  <p className="mt-1 text-sm text-secondary">
                    {result.doc_number && (
                      <>
                        {"領収書"}: {result.doc_number}
                      </>
                    )}
                  </p>
                </div>

                <div className="space-y-2 rounded-xl bg-surface-hover p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-secondary">{"お会計"}</span>
                    <span className="font-semibold">{formatJpy(result.amount)}</span>
                  </div>
                  {result.change > 0 && (
                    <div className="flex justify-between">
                      <span className="text-secondary">{"お釣り"}</span>
                      <span className="font-semibold text-accent">{formatJpy(result.change)}</span>
                    </div>
                  )}
                </div>

                {/* 在庫引落候補 (menu_item_id が拾えた行のみ) */}
                <PosInventoryDeductPanel
                  sales={
                    mode === "reservation" && selected?.menu_items_json
                      ? selected.menu_items_json
                          .filter((mi) => !!mi.menu_item_id)
                          .map((mi) => ({
                            menu_item_id: mi.menu_item_id as string,
                            menu_item_name: mi.name,
                            sold_quantity: mi.quantity ?? 1,
                          }))
                      : []
                  }
                />

                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setCart([]);
                    setResult(null);
                  }}
                  className="btn-primary w-full rounded-xl py-3 text-sm font-medium"
                >
                  {"次の会計へ"}
                </button>
              </div>
            ) : qrStep !== "idle" && paymentMethod === "card" ? (
              /* ── QR Code payment screen ── */
              <div className="glass-card space-y-4 rounded-2xl p-6">
                {(qrStep === "showing" || qrStep === "paid" || qrStep === "recording") && (
                  <div className="text-center space-y-4">
                    {/* Amount */}
                    <div className="text-3xl font-bold text-primary">{formatJpy(amount)}</div>

                    {qrStep === "showing" && qrDataUrl ? (
                      <>
                        {/* QR Code */}
                        <div className="flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrDataUrl}
                            alt="QR Code"
                            width={250}
                            height={250}
                            className="rounded-xl border border-border-subtle"
                          />
                        </div>

                        {/* Instructions */}
                        <p className="text-sm font-semibold text-primary">
                          {"お客様のスマートフォンでスキャンしてお支払いください"}
                        </p>
                        <p className="text-xs text-secondary">{"カード / Apple Pay / Google Pay が使えます"}</p>

                        {/* Spinner */}
                        <div className="flex items-center justify-center gap-2 text-sm text-info-text">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-info-text border-t-transparent" />
                          {"決済待ち..."}
                        </div>

                        {/* Cancel button */}
                        <button
                          type="button"
                          onClick={handleCancelQr}
                          className="w-full rounded-xl border border-border-subtle bg-surface py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover"
                        >
                          {"キャンセル"}
                        </button>
                      </>
                    ) : qrStep === "paid" || qrStep === "recording" ? (
                      <>
                        {/* Payment success */}
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-dim">
                          <svg
                            width="32"
                            height="32"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                            className="text-success-text"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </div>
                        <p className="text-lg font-semibold text-success-text">{"決済完了"}</p>
                        <div className="flex items-center justify-center gap-2 text-sm text-secondary">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-transparent" />
                          {"記録中..."}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}

                {qrStep === "creating" && (
                  <div className="flex flex-col items-center justify-center py-8 space-y-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-info-text border-t-transparent" />
                    <p className="text-sm font-medium text-info-text">{"QRコードを生成中..."}</p>
                  </div>
                )}

                {qrStep === "error" && (
                  <div className="space-y-3 text-center py-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-dim">
                      <svg
                        width="24"
                        height="24"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        className="text-danger-text"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-danger-text">{qrError ?? "QRコード決済に失敗しました"}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleCancelQr}
                        className="flex-1 rounded-xl border border-border-subtle bg-surface py-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-hover"
                      >
                        {"戻る"}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          pendingRecordSessionId ? recordQrSale(pendingRecordSessionId) : handleCheckout()
                        }
                        className="flex-1 rounded-xl bg-[#635BFF] py-2.5 text-sm font-semibold text-white shadow-lg transition-transform active:scale-95"
                      >
                        {pendingRecordSessionId ? "記録をやり直す" : "再試行"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : hasSelection ? (
              /* ── Checkout form ── */
              <div className="glass-card space-y-5 rounded-2xl p-6">
                <div>
                  <h3 className="text-base font-semibold text-primary">
                    {mode === "reservation"
                      ? selected?.title || "無題"
                      : mode === "invoice"
                        ? loadedInvoice?.doc_number || "請求書"
                        : "ウォークイン会計"}
                  </h3>
                  {mode === "reservation" && selected?.customer_name && (
                    <p className="mt-0.5 text-xs text-secondary">{selected.customer_name}</p>
                  )}
                  {mode === "invoice" && loadedInvoice?.recipient_name && (
                    <p className="mt-0.5 text-xs text-secondary">{loadedInvoice.recipient_name}</p>
                  )}
                </div>

                {/* Items */}
                {checkoutItems.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-secondary">{"明細"}</span>
                    <div className="space-y-1 rounded-xl bg-surface-hover p-3">
                      {checkoutItems.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-primary">
                            {item.description}
                            {item.quantity > 1 && <span className="ml-1 text-xs text-secondary">x{item.quantity}</span>}
                          </span>
                          <span className="font-medium">{formatJpy(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inventory warnings — only renders when a line item carries inventory_item_id */}
                <InventoryWarningsBanner items={checkoutItems as unknown as Array<Record<string, unknown>>} />

                {/* Total */}
                <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                  <span className="text-sm font-medium text-secondary">{"合計"}</span>
                  <span className="text-2xl font-bold text-primary">{formatJpy(amount)}</span>
                </div>

                {/* Payment method */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-secondary">{"支払方法"}</span>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() => setPaymentMethod(pm.value)}
                        className={`rounded-xl border px-2 py-2.5 text-center text-xs font-medium transition-colors ${
                          paymentMethod === pm.value
                            ? "border-accent bg-accent-dim text-accent"
                            : "border-border-subtle bg-surface text-secondary hover:border-border"
                        }`}
                      >
                        <span className="block text-base">{pm.icon}</span>
                        {pm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Received amount (cash only) */}
                {paymentMethod === "cash" && (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-secondary">{"預り金額"}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      placeholder={String(amount)}
                      className="w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-right text-lg font-semibold text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {/* Quick amount buttons */}
                    <div className="flex flex-wrap gap-1.5">
                      {[1000, 5000, 10000, 50000].map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setReceivedAmount(String(v))}
                          className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1 text-xs text-secondary transition-colors hover:border-border hover:text-primary"
                        >
                          {formatJpy(v)}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setReceivedAmount(String(amount))}
                        className="rounded-lg border border-border-subtle bg-surface px-2.5 py-1 text-xs text-secondary transition-colors hover:border-border hover:text-primary"
                      >
                        {"ぴったり"}
                      </button>
                    </div>
                    {change > 0 && (
                      <div className="flex items-center justify-between rounded-xl bg-accent-dim px-4 py-2.5">
                        <span className="text-sm text-accent">{"お釣り"}</span>
                        <span className="text-lg font-bold text-accent">{formatJpy(change)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Note */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-secondary">{"メモ（任意）"}</span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={"備考を入力"}
                    className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                {/* Error */}
                {error && <div className="rounded-xl bg-danger-dim px-4 py-2.5 text-sm text-danger-text">{error}</div>}

                {/* Submit */}
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={!canCheckout}
                  className="btn-primary w-full rounded-xl py-3.5 text-base font-semibold disabled:opacity-40"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      {"処理中..."}
                    </span>
                  ) : paymentMethod === "card" ? (
                    `${formatJpy(amount)} カード決済を開始`
                  ) : (
                    `${formatJpy(amount)} を会計する`
                  )}
                </button>
              </div>
            ) : (
              /* ── No selection ── */
              <div className="glass-card flex min-h-[300px] items-center justify-center rounded-2xl p-6 text-center">
                <div>
                  <svg
                    width="48"
                    height="48"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                    className="mx-auto mb-3 text-muted"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z"
                    />
                  </svg>
                  <p className="text-sm text-muted">
                    {mode === "reservation"
                      ? "左の一覧から予約を選択してください"
                      : mode === "invoice"
                        ? "請求書番号を入力して検索してください"
                        : "左の品目をタップしてカートに追加してください"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
