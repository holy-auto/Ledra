"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── 型定義 ──────────────────────────────────────────────────────
interface CurrentLoan {
  customer_name: string | null;
  return_due_at: string | null;
  reservation_id: string | null;
  lent_at: string;
}
interface LoanerCar {
  id: string;
  name: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_loan: CurrentLoan | null;
}

interface JoinedRef {
  id: string;
  name?: string | null;
  title?: string | null;
  scheduled_date?: string | null;
  plate_display?: string | null;
}
interface Loan {
  id: string;
  loaner_car_id: string;
  reservation_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  lent_at: string;
  return_due_at: string | null;
  returned_at: string | null;
  notes: string | null;
  loaner_car: JoinedRef | null;
  customer: JoinedRef | null;
  reservation: JoinedRef | null;
}

interface CustomerOption {
  id: string;
  name: string;
}
interface ReservationOption {
  id: string;
  label: string;
}

type TabKey = "cars" | "history";

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function carLabel(car: LoanerCar): string {
  const sub = [car.maker, car.model].filter(Boolean).join(" ");
  return sub ? `${car.name}（${sub}）` : car.name;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${formatDate(value)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 返却予定が過ぎていて未返却なら true。 */
function isOverdue(due: string | null): boolean {
  if (!due) return false;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function LoanerCarsClient() {
  const [cars, setCars] = useState<LoanerCar[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loansLoading, setLoansLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("cars");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [lendTarget, setLendTarget] = useState<LoanerCar | null>(null);
  const [returnTarget, setReturnTarget] = useState<LoanerCar | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchCars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/loaner-cars");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setCars(Array.isArray(data.cars) ? data.cars : []);
    } catch (e) {
      console.error(e);
      showToast("error", "代車の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const fetchLoans = useCallback(async () => {
    setLoansLoading(true);
    try {
      const res = await fetch("/api/admin/loaner-cars/loans?active_only=false");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setLoans(Array.isArray(data.loans) ? data.loans : []);
    } catch (e) {
      console.error(e);
      showToast("error", "貸出履歴の読み込みに失敗しました");
    } finally {
      setLoansLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchCars();
  }, [fetchCars]);

  useEffect(() => {
    if (activeTab === "history") fetchLoans();
  }, [activeTab, fetchLoans]);

  const availableCars = useMemo(() => cars.filter((c) => c.is_active && !c.current_loan), [cars]);

  const handleReturn = useCallback(
    async (car: LoanerCar) => {
      // car.current_loan の貸出 id が必要なので、その代車の未返却貸出を取得して返却する。
      setBusyId(car.id);
      try {
        const listRes = await fetch(`/api/admin/loaner-cars/loans?car_id=${car.id}&active_only=true`);
        if (!listRes.ok) throw new Error("fetch failed");
        const listData = await listRes.json();
        const loan: Loan | undefined = (listData.loans ?? [])[0];
        if (!loan) {
          showToast("error", "貸出記録が見つかりませんでした");
          return;
        }
        const res = await fetch("/api/admin/loaner-cars/loans", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: loan.id }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "return failed");
        }
        showToast("success", "返却を記録しました");
        setReturnTarget(null);
        await fetchCars();
        if (activeTab === "history") await fetchLoans();
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "返却に失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [activeTab, fetchCars, fetchLoans, showToast],
  );

  return (
    <div className="mx-auto max-w-5xl pb-20">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">代車管理</h1>
          <p className="mt-1 text-sm text-secondary">代車の貸出状況と返却予定を管理します</p>
        </div>
        <button
          onClick={() => setRegisterOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          代車を登録
        </button>
      </div>

      {/* タブ */}
      <div className="mb-6 flex border-b border-border-default">
        {(["cars", "history"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {tab === "cars" ? "代車一覧" : "貸出履歴"}
          </button>
        ))}
      </div>

      {activeTab === "cars" ? (
        loading ? (
          <Spinner />
        ) : cars.length === 0 ? (
          <EmptyState text="代車がまだ登録されていません。「代車を登録」から追加してください。" />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cars.map((car) => {
              const onLoan = !!car.current_loan;
              const overdue = isOverdue(car.current_loan?.return_due_at ?? null);
              const busy = busyId === car.id;
              return (
                <div key={car.id} className="glass-card flex flex-col rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-primary">{car.name}</div>
                      {car.plate_display && <div className="mt-0.5 text-xs text-muted">{car.plate_display}</div>}
                      {(car.maker || car.model) && (
                        <div className="mt-0.5 truncate text-xs text-secondary">
                          {[car.maker, car.model].filter(Boolean).join(" ")}
                        </div>
                      )}
                    </div>
                    {!car.is_active ? (
                      <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-muted">
                        休止中
                      </span>
                    ) : onLoan ? (
                      <span className="shrink-0 rounded-full bg-danger-dim px-2 py-0.5 text-xs font-medium text-danger-text">
                        貸出中
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-success-dim px-2 py-0.5 text-xs font-medium text-success-text">
                        空き
                      </span>
                    )}
                  </div>

                  {onLoan && car.current_loan && (
                    <div className="mt-3 space-y-1 rounded-md border border-border-subtle bg-inset p-2.5">
                      <div className="text-xs text-secondary">
                        貸出先:{" "}
                        <span className="text-primary">{car.current_loan.customer_name || "（顧客名なし）"}</span>
                      </div>
                      <div className="text-xs text-secondary">
                        返却予定:{" "}
                        <span className={overdue ? "font-semibold text-danger" : "text-primary"}>
                          {formatDate(car.current_loan.return_due_at)}
                          {overdue && "（超過）"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-1 items-end gap-2">
                    {onLoan ? (
                      <button
                        disabled={busy}
                        onClick={() => setReturnTarget(car)}
                        className="w-full rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                      >
                        返却
                      </button>
                    ) : (
                      <button
                        disabled={busy || !car.is_active}
                        onClick={() => setLendTarget(car)}
                        className="w-full rounded-lg bg-inset px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
                      >
                        貸出
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : loansLoading ? (
        <Spinner />
      ) : loans.length === 0 ? (
        <EmptyState text="貸出履歴がありません。" />
      ) : (
        <div className="glass-card overflow-x-auto rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default text-left text-xs text-muted">
                <th className="px-3 py-2.5 font-medium">車両</th>
                <th className="px-3 py-2.5 font-medium">顧客名</th>
                <th className="px-3 py-2.5 font-medium">貸出日</th>
                <th className="px-3 py-2.5 font-medium">返却予定</th>
                <th className="px-3 py-2.5 font-medium">返却日</th>
                <th className="px-3 py-2.5 font-medium">状態</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => {
                const out = !loan.returned_at;
                const overdue = out && isOverdue(loan.return_due_at);
                return (
                  <tr key={loan.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-3 py-2.5 text-primary">
                      {loan.loaner_car?.name ?? "—"}
                      {loan.loaner_car?.plate_display && (
                        <span className="ml-1 text-xs text-muted">{loan.loaner_car.plate_display}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{loan.customer?.name ?? loan.customer_name ?? "—"}</td>
                    <td className="px-3 py-2.5 text-secondary">{formatDateTime(loan.lent_at)}</td>
                    <td className={`px-3 py-2.5 ${overdue ? "font-semibold text-danger" : "text-secondary"}`}>
                      {formatDate(loan.return_due_at)}
                      {overdue && "（超過）"}
                    </td>
                    <td className="px-3 py-2.5 text-secondary">{formatDateTime(loan.returned_at)}</td>
                    <td className="px-3 py-2.5">
                      {out ? (
                        <span className="rounded-full bg-danger-dim px-2 py-0.5 text-xs font-medium text-danger-text">
                          貸出中
                        </span>
                      ) : (
                        <span className="rounded-full bg-success-dim px-2 py-0.5 text-xs font-medium text-success-text">
                          返却済
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 代車登録ダイアログ */}
      {registerOpen && (
        <RegisterDialog
          onClose={() => setRegisterOpen(false)}
          onCreated={async () => {
            setRegisterOpen(false);
            showToast("success", "代車を登録しました");
            await fetchCars();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 貸出ダイアログ */}
      {lendTarget && (
        <LendDialog
          car={lendTarget}
          availableCars={availableCars}
          onClose={() => setLendTarget(null)}
          onLent={async () => {
            setLendTarget(null);
            showToast("success", "貸出を記録しました");
            await fetchCars();
            if (activeTab === "history") await fetchLoans();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 返却ダイアログ */}
      {returnTarget && (
        <ReturnDialog
          car={returnTarget}
          submitting={busyId === returnTarget.id}
          onClose={() => setReturnTarget(null)}
          onConfirm={() => handleReturn(returnTarget)}
        />
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 代車登録ダイアログ ───
function RegisterDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) {
      onError("管理名を入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/loaner-cars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          plate_display: plate.trim() || null,
          maker: maker.trim() || null,
          model: model.trim() || null,
          year: year ? Number(year) : null,
          color: color.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="代車を登録" onClose={onClose}>
      <div className="space-y-4">
        <Field label="管理名" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 代車A"
            className={`w-full ${inputCls}`}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ナンバー">
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="例: 品川123あ4567"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="年式">
            <input
              type="number"
              min={1900}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="例: 2020"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="メーカー">
            <input
              value={maker}
              onChange={(e) => setMaker(e.target.value)}
              placeholder="例: トヨタ"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="車種">
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="例: アクア"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="カラー">
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="例: ホワイト"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>
        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>
      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="登録する" />
    </DialogShell>
  );
}

// ─── 貸出ダイアログ ───
function LendDialog({
  car,
  availableCars,
  onClose,
  onLent,
  onError,
}: {
  car: LoanerCar;
  availableCars: LoanerCar[];
  onClose: () => void;
  onLent: () => void;
  onError: (msg: string) => void;
}) {
  const [carId, setCarId] = useState(car.id);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [returnDue, setReturnDue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { customers, search, setSearch } = useCustomerSearch();
  const reservations = useReservations();

  async function submit() {
    if (!carId) {
      onError("代車を選択してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/loaner-cars/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loaner_car_id: carId,
          customer_id: customerId || null,
          customer_name: customerName.trim() || null,
          reservation_id: reservationId || null,
          return_due_at: returnDue ? new Date(returnDue).toISOString() : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "lend failed");
      }
      onLent();
    } catch (e) {
      onError(e instanceof Error ? e.message : "貸出に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="代車を貸し出す" onClose={onClose}>
      <div className="space-y-4">
        <Field label="代車" required>
          <select value={carId} onChange={(e) => setCarId(e.target.value)} className={`w-full ${inputCls}`}>
            {/* 現在対象の car が availableCars に含まれない場合 (理論上含まれる) に備えて先頭に出す */}
            {!availableCars.some((c) => c.id === car.id) && <option value={car.id}>{carLabel(car)}</option>}
            {availableCars.map((c) => (
              <option key={c.id} value={c.id}>
                {carLabel(c)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="顧客（検索して選択 / 直接入力）">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // 手入力した時点で選択済み customer はクリアし、名前スナップショットに使う。
              setCustomerId("");
              setCustomerName(e.target.value);
            }}
            placeholder="顧客名で検索 または 直接入力"
            className={`w-full ${inputCls}`}
          />
          {search && customers.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border-default bg-surface">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerName(c.name);
                      setSearch(c.name);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-hover ${
                      customerId === c.id ? "text-accent" : "text-secondary"
                    }`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="返却予定日">
            <input
              type="date"
              value={returnDue}
              onChange={(e) => setReturnDue(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="関連予約（任意）">
            <select
              value={reservationId}
              onChange={(e) => setReservationId(e.target.value)}
              className={`w-full ${inputCls}`}
            >
              <option value="">（なし）</option>
              {reservations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>
      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="貸出を記録" />
    </DialogShell>
  );
}

// ─── 返却ダイアログ ───
function ReturnDialog({
  car,
  submitting,
  onClose,
  onConfirm,
}: {
  car: LoanerCar;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const todayStr = formatDate(new Date().toISOString());
  return (
    <DialogShell title="代車を返却" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-secondary">
          <span className="font-medium text-primary">{carLabel(car)}</span> の返却を記録します。
        </p>
        {car.current_loan && (
          <div className="rounded-md border border-border-subtle bg-inset p-3 text-sm">
            <div className="text-secondary">
              貸出先: <span className="text-primary">{car.current_loan.customer_name || "（顧客名なし）"}</span>
            </div>
            <div className="mt-1 text-secondary">返却予定: {formatDate(car.current_loan.return_due_at)}</div>
          </div>
        )}
        <p className="text-xs text-muted">返却日: {todayStr}（本日）</p>
      </div>
      <DialogActions onClose={onClose} onSubmit={onConfirm} submitting={submitting} submitLabel="返却する" />
    </DialogShell>
  );
}

// ─── 顧客検索フック (type-to-filter) ───
function useCustomerSearch() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setCustomers([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}&per_page=20`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.customers ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setCustomers(list.map((c) => ({ id: String(c.id), name: String(c.name ?? "") })));
      } catch {
        /* オプショナル */
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [search]);

  return { customers, search, setSearch };
}

// ─── 予約一覧フック ───
function useReservations() {
  const [reservations, setReservations] = useState<ReservationOption[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/reservations?per_page=50");
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.reservations ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setReservations(
          list.map((r) => {
            const title = String(r.title ?? "予約");
            const date = r.scheduled_date ? String(r.scheduled_date) : "";
            return { id: String(r.id), label: date ? `${date} ${title}` : title };
          }),
        );
      } catch {
        /* オプショナル */
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return reservations;
}

// ─── 共通パーツ ───
function Spinner() {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="glass-card rounded-xl p-10 text-center text-muted">
      <p className="text-sm">{text}</p>
    </div>
  );
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function DialogActions({
  onClose,
  onSubmit,
  submitting,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded-lg bg-inset px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? "処理中…" : submitLabel}
      </button>
    </div>
  );
}
