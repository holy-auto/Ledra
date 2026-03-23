"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import { formatJpy, formatDate } from "@/lib/format";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";

// NOTE: Stripe Terminal JS SDK を使う場合は `npm install @stripe/terminal-js` を実行してください
// import { loadStripeTerminal } from '@stripe/terminal-js';

/* ────────────────────────────────────────────── */
/*  Stripe Terminal types (SDK未インストール時用)   */
/* ────────────────────────────────────────────── */
type TerminalStatus = "idle" | "connecting" | "waiting_card" | "processing" | "succeeded" | "failed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeTerminalInstance = any;

/* ────────────────────────────────────────────── */
/*  Types                                         */
/* ────────────────────────────────────────────── */

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

interface CheckoutResult {
  payment_id: string;
  document_id: string | null;
  amount: number;
  change: number;
  doc_number: string | null;
  status: string;
}

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

const RESERVATION_STATUS_MAP: Record<string, { variant: "default" | "success" | "warning" | "danger" | "info" | "violet"; label: string }> = {
  confirmed: { variant: "info", label: "確定" },
  arrived: { variant: "violet", label: "来店" },
  in_progress: { variant: "warning", label: "作業中" },
  completed: { variant: "success", label: "完了" },
  cancelled: { variant: "default", label: "取消" },
};

const PAYMENT_STATUS_MAP: Record<string, { variant: "default" | "success" | "warning" | "danger" | "info" | "violet"; label: string }> = {
  unpaid: { variant: "default", label: "未会計" },
  paid: { variant: "success", label: "会計済" },
  partial: { variant: "warning", label: "一部" },
  refunded: { variant: "danger", label: "返金済" },
};

/* ────────────────────────────────────────────── */
/*  Component                                     */
/* ────────────────────────────────────────────── */

export default function PosClient() {
  // ── Data fetch ──
  const { data, isLoading, mutate } = useSWR<ReservationsData>(
    "/api/admin/reservations?status=arrived,in_progress,completed&limit=200",
    fetcher,
    { revalidateOnFocus: true, refreshInterval: 15_000, keepPreviousData: true },
  );

  const reservations = data?.reservations ?? [];

  // Filter to unpaid only
  const unpaidReservations = useMemo(
    () => reservations.filter((r) => !r.payment_status || r.payment_status === "unpaid"),
    [reservations],
  );

  const paidReservations = useMemo(
    () => reservations.filter((r) => r.payment_status === "paid"),
    [reservations],
  );

  // ── State ──
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [receivedAmount, setReceivedAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Stripe Terminal state ──
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>("idle");
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const terminalRef = useRef<StripeTerminalInstance>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Computed ──
  const amount = selected?.estimated_amount ?? 0;
  const received = receivedAmount ? parseInt(receivedAmount, 10) : amount;
  const change = paymentMethod === "cash" ? Math.max(0, received - amount) : 0;

  // Items from selected reservation
  const items = useMemo(() => {
    if (!selected?.menu_items_json) return [];
    return selected.menu_items_json.map((mi) => ({
      description: mi.name,
      quantity: mi.quantity ?? 1,
      unit_price: mi.unit_price ?? mi.price ?? 0,
      amount: (mi.quantity ?? 1) * (mi.unit_price ?? mi.price ?? 0),
    }));
  }, [selected]);

  // Reset form when selection changes
  useEffect(() => {
    setPaymentMethod("cash");
    setReceivedAmount("");
    setNote("");
    setResult(null);
    setError(null);
    setTerminalStatus("idle");
    setTerminalError(null);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, [selected?.id]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ── Stripe Terminal: initialize (lazy) ──
  const getTerminal = useCallback(async (): Promise<StripeTerminalInstance | null> => {
    if (terminalRef.current) return terminalRef.current;

    try {
      // 動的インポートで @stripe/terminal-js をロード
      // @ts-expect-error -- @stripe/terminal-js は別途 npm install が必要
      const mod = await import("@stripe/terminal-js");
      const loadStripeTerminal = mod.loadStripeTerminal ?? mod.default?.loadStripeTerminal;
      if (!loadStripeTerminal) throw new Error("loadStripeTerminal not found");
      const StripeTerminal = await loadStripeTerminal();
      if (!StripeTerminal) throw new Error("Stripe Terminal SDK のロードに失敗しました");

      const terminal = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const res = await fetch("/api/admin/pos/terminal/connection-token", { method: "POST" });
          if (!res.ok) throw new Error("Connection token の取得に失敗しました");
          const { secret } = await res.json();
          return secret;
        },
        onUnexpectedReaderDisconnect: () => {
          setTerminalError("リーダーが切断されました");
          setTerminalStatus("failed");
        },
      });

      terminalRef.current = terminal;
      return terminal;
    } catch {
      // SDK未インストール時はnullを返す（フォールバックモードで動作）
      return null;
    }
  }, []);

  // ── Card payment: Full Terminal SDK flow ──
  const handleCardPaymentWithTerminal = useCallback(async (terminal: StripeTerminalInstance) => {
    if (!selected) return;

    setTerminalStatus("processing");
    setTerminalError(null);

    try {
      // 1. PaymentIntent 作成
      const piRes = await fetch("/api/admin/pos/terminal/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: items.map((i) => i.description).join(", ") || selected.title || "POS会計",
        }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData?.error ?? "PaymentIntent の作成に失敗しました");

      // 2. リーダーに接続（未接続の場合）
      setTerminalStatus("connecting");
      const discoverResult = await terminal.discoverReaders();
      if (discoverResult.error) throw new Error(discoverResult.error.message);

      if (discoverResult.discoveredReaders.length === 0) {
        throw new Error("利用可能なカードリーダーが見つかりません");
      }

      const connectResult = await terminal.connectReader(discoverResult.discoveredReaders[0]);
      if (connectResult.error) throw new Error(connectResult.error.message);

      // 3. カード決済実行
      setTerminalStatus("waiting_card");
      const collectResult = await terminal.collectPaymentMethod(piData.client_secret);
      if (collectResult.error) throw new Error(collectResult.error.message);

      setTerminalStatus("processing");
      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if (processResult.error) throw new Error(processResult.error.message);

      // 4. サーバーで capture + DB記録
      const captureRes = await fetch("/api/admin/pos/terminal/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_intent_id: processResult.paymentIntent.id,
          reservation_id: selected.id,
          customer_id: selected.customer_id,
          items_json: items.map((ci) => ({
            description: ci.description,
            quantity: ci.quantity,
            unit_price: ci.unit_price,
            amount: ci.amount,
          })),
          tax_rate: 10,
          note: note || undefined,
        }),
      });
      const captureData = await captureRes.json();
      if (!captureRes.ok) throw new Error(captureData?.error ?? "決済の記録に失敗しました");

      setResult(captureData);
      setTerminalStatus("succeeded");
      await mutate();
    } catch (e) {
      setTerminalError(e instanceof Error ? e.message : "カード決済に失敗しました");
      setTerminalStatus("failed");
    }
  }, [selected, amount, items, note, mutate]);

  // ── Card payment: Fallback polling flow (SDK未インストール時) ──
  const handleCardPaymentFallback = useCallback(async () => {
    if (!selected) return;

    setTerminalStatus("processing");
    setTerminalError(null);

    try {
      // 1. PaymentIntent 作成
      const piRes = await fetch("/api/admin/pos/terminal/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: items.map((i) => i.description).join(", ") || selected.title || "POS会計",
        }),
      });
      const piData = await piRes.json();
      if (!piRes.ok) throw new Error(piData?.error ?? "PaymentIntent の作成に失敗しました");

      const paymentIntentId = piData.payment_intent_id;

      // 2. 「カード決済待ち」状態 - 端末側での決済を待つ
      setTerminalStatus("waiting_card");

      // ポーリングで PaymentIntent のステータスを確認
      await new Promise<void>((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 120; // 最大2分 (1秒間隔)

        pollingRef.current = setInterval(async () => {
          attempts++;
          if (attempts > maxAttempts) {
            if (pollingRef.current) clearInterval(pollingRef.current);
            pollingRef.current = null;
            reject(new Error("決済がタイムアウトしました。もう一度お試しください。"));
            return;
          }

          try {
            const statusRes = await fetch(`/api/admin/pos/terminal/create-payment-intent?id=${paymentIntentId}`, {
              method: "GET",
            });

            // GET未実装の場合はポーリングをスキップ（端末側で処理される想定）
            if (statusRes.status === 405) return;

            const statusData = await statusRes.json();
            if (statusData.status === "requires_capture" || statusData.status === "succeeded") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              pollingRef.current = null;
              resolve();
            } else if (statusData.status === "canceled" || statusData.status === "requires_payment_method") {
              if (pollingRef.current) clearInterval(pollingRef.current);
              pollingRef.current = null;
              reject(new Error("決済がキャンセルされました"));
            }
          } catch {
            // ポーリング中のネットワークエラーは無視して次回リトライ
          }
        }, 1000);
      });

      // 3. Capture + DB記録
      setTerminalStatus("processing");
      const captureRes = await fetch("/api/admin/pos/terminal/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          reservation_id: selected.id,
          customer_id: selected.customer_id,
          items_json: items.map((ci) => ({
            description: ci.description,
            quantity: ci.quantity,
            unit_price: ci.unit_price,
            amount: ci.amount,
          })),
          tax_rate: 10,
          note: note || undefined,
        }),
      });
      const captureData = await captureRes.json();
      if (!captureRes.ok) throw new Error(captureData?.error ?? "決済の記録に失敗しました");

      setResult(captureData);
      setTerminalStatus("succeeded");
      await mutate();
    } catch (e) {
      setTerminalError(e instanceof Error ? e.message : "カード決済に失敗しました");
      setTerminalStatus("failed");
    }
  }, [selected, amount, items, note, mutate]);

  // ── Main checkout handler ──
  const handleCheckout = useCallback(async () => {
    if (!selected || processing) return;

    // カード決済の場合は Stripe Terminal フローへ
    if (paymentMethod === "card") {
      setProcessing(true);
      setError(null);
      try {
        const terminal = await getTerminal();
        if (terminal) {
          await handleCardPaymentWithTerminal(terminal);
        } else {
          await handleCardPaymentFallback();
        }
      } finally {
        setProcessing(false);
      }
      return;
    }

    // 現金・QR・振込・その他 → 従来通り即 pos_checkout
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservation_id: selected.id,
          customer_id: selected.customer_id,
          payment_method: paymentMethod,
          amount,
          received_amount: paymentMethod === "cash" ? received : undefined,
          items_json: items,
          tax_rate: 10,
          note: note || undefined,
          create_receipt: true,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setResult(j);
      await mutate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "会計処理に失敗しました");
    } finally {
      setProcessing(false);
    }
  }, [selected, processing, paymentMethod, amount, received, items, note, mutate, getTerminal, handleCardPaymentWithTerminal, handleCardPaymentFallback]);

  // ── Render ──
  return (
    <div className="space-y-6">
      <PageHeader title="POS 会計" tag="POS" description="予約の会計処理を行います" />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="未会計" value={unpaidReservations.length} />
        <StatCard label="本日会計済" value={paidReservations.length} />
        <StatCard
          label="本日売上"
          value={formatJpy(
            paidReservations.reduce((s, r) => s + (r.estimated_amount ?? 0), 0),
          )}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── Left: Reservation list ── */}
        <div className="flex-1 space-y-3">
          <h2 className="text-sm font-semibold text-secondary">未会計の予約</h2>

          {isLoading && !data ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-hover" />
              ))}
            </div>
          ) : unpaidReservations.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-surface p-8 text-center text-sm text-muted">
              未会計の予約はありません
            </div>
          ) : (
            <div className="space-y-2">
              {unpaidReservations.map((r) => {
                const isSelected = selected?.id === r.id;
                const statusEntry = RESERVATION_STATUS_MAP[r.status] ?? { variant: "default" as const, label: r.status };
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
                        <span className="text-sm font-semibold text-primary">
                          {formatJpy(r.estimated_amount)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-secondary">
                      {r.scheduled_date && <span>{formatDate(r.scheduled_date)}</span>}
                      {r.start_time && <span>{r.start_time}〜{r.end_time ?? ""}</span>}
                      {r.customer_name && <span>{r.customer_name}</span>}
                      {r.vehicle_info && <span>{r.vehicle_info}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
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
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-success-text">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-primary">会計完了</h3>
                  <p className="mt-1 text-sm text-secondary">
                    {result.doc_number && <>領収書: {result.doc_number}</>}
                  </p>
                </div>

                <div className="space-y-2 rounded-xl bg-surface-hover p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-secondary">お会計</span>
                    <span className="font-semibold">{formatJpy(result.amount)}</span>
                  </div>
                  {result.change > 0 && (
                    <div className="flex justify-between">
                      <span className="text-secondary">お釣り</span>
                      <span className="font-semibold text-accent">{formatJpy(result.change)}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setResult(null);
                  }}
                  className="btn-primary w-full rounded-xl py-3 text-sm font-medium"
                >
                  次の会計へ
                </button>
              </div>
            ) : selected ? (
              /* ── Checkout form ── */
              <div className="glass-card space-y-5 rounded-2xl p-6">
                <div>
                  <h3 className="text-base font-semibold text-primary">{selected.title || "無題"}</h3>
                  {selected.customer_name && (
                    <p className="mt-0.5 text-xs text-secondary">{selected.customer_name}</p>
                  )}
                </div>

                {/* Items */}
                {items.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-secondary">明細</span>
                    <div className="space-y-1 rounded-xl bg-surface-hover p-3">
                      {items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-primary">
                            {item.description}
                            {item.quantity > 1 && (
                              <span className="ml-1 text-xs text-secondary">×{item.quantity}</span>
                            )}
                          </span>
                          <span className="font-medium">{formatJpy(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total */}
                <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                  <span className="text-sm font-medium text-secondary">合計</span>
                  <span className="text-2xl font-bold text-primary">{formatJpy(amount)}</span>
                </div>

                {/* Payment method */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-secondary">支払方法</span>
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
                    <span className="text-xs font-medium text-secondary">預り金額</span>
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
                        ぴったり
                      </button>
                    </div>
                    {change > 0 && (
                      <div className="flex items-center justify-between rounded-xl bg-accent-dim px-4 py-2.5">
                        <span className="text-sm text-accent">お釣り</span>
                        <span className="text-lg font-bold text-accent">{formatJpy(change)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Note */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-secondary">メモ（任意）</span>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="備考を入力"
                    className="w-full rounded-xl border border-border-subtle bg-surface px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="rounded-xl bg-danger-dim px-4 py-2.5 text-sm text-danger-text">
                    {error}
                  </div>
                )}

                {/* Terminal status (card payment) */}
                {terminalStatus !== "idle" && paymentMethod === "card" && (
                  <div className="rounded-xl bg-surface-hover p-4 text-center">
                    {terminalStatus === "connecting" && (
                      <div className="flex items-center justify-center gap-2 text-sm text-secondary">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        リーダーに接続中...
                      </div>
                    )}
                    {terminalStatus === "waiting_card" && (
                      <div className="space-y-2">
                        <div className="text-3xl">💳</div>
                        <div className="text-sm font-medium text-primary">カードをタッチしてください</div>
                        <div className="text-xs text-secondary">端末でカード決済を実行中...</div>
                      </div>
                    )}
                    {terminalStatus === "processing" && (
                      <div className="flex items-center justify-center gap-2 text-sm text-secondary">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        決済処理中...
                      </div>
                    )}
                    {terminalStatus === "failed" && (
                      <div className="space-y-2">
                        <div className="text-sm text-danger-text">{terminalError}</div>
                        <button
                          type="button"
                          onClick={() => {
                            setTerminalStatus("idle");
                            setTerminalError(null);
                            setProcessing(false);
                          }}
                          className="rounded-lg border border-border-subtle bg-surface px-4 py-1.5 text-xs font-medium text-secondary transition-colors hover:border-border hover:text-primary"
                        >
                          リトライ
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={processing || amount <= 0 || (paymentMethod === "cash" && received < amount) || (paymentMethod === "card" && terminalStatus !== "idle" && terminalStatus !== "failed")}
                  className="btn-primary w-full rounded-xl py-3.5 text-base font-semibold disabled:opacity-40"
                >
                  {processing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      処理中...
                    </span>
                  ) : (
                    `${formatJpy(amount)} を会計する`
                  )}
                </button>
              </div>
            ) : (
              /* ── No selection ── */
              <div className="glass-card flex min-h-[300px] items-center justify-center rounded-2xl p-6 text-center">
                <div>
                  <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} className="mx-auto mb-3 text-muted">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                  </svg>
                  <p className="text-sm text-muted">
                    左の一覧から予約を選択してください
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
