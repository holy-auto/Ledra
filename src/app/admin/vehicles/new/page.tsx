"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminVehicleNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/admin/vehicles";

  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [plateDisplay, setPlateDisplay] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhoneMasked, setCustomerPhoneMasked] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          customer_name: customerName || null,
          customer_email: customerEmail || null,
          customer_phone_masked: customerPhoneMasked || null,
          notes: notes || null,
        }),
      });

      const j = await res.json();

      if (!res.ok) {
        setErr(j?.error || "保存に失敗しました。");
        return;
      }

      if (j?.id && returnTo === "/admin/vehicles") {
        router.push(`/admin/vehicles/${j.id}`);
        return;
      }

      router.push(returnTo);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
  const labelCls = "block space-y-1.5";
  const labelTextCls = "text-sm font-medium text-neutral-700";

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              NEW VEHICLE
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                車両を登録
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                CARTRUST RECORD の車両マスターを登録します。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Link
              href="/admin/vehicles"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              車両一覧
            </Link>
            <Link
              href="/admin"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ダッシュボード
            </Link>
          </div>
        </header>

        {/* Form */}
        <form onSubmit={onSubmit} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-6">

          {/* Vehicle info */}
          <div>
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VEHICLE INFO</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">車両情報</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                <span className={labelTextCls}>メーカー <span className="text-red-500">*</span></span>
                <input
                  value={maker}
                  onChange={(e) => setMaker(e.target.value)}
                  className={inputCls}
                  placeholder="Toyota"
                  required
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>車種 <span className="text-red-500">*</span></span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={inputCls}
                  placeholder="Prius"
                  required
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>年式</span>
                <input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="2022"
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>ナンバー表示</span>
                <input
                  value={plateDisplay}
                  onChange={(e) => setPlateDisplay(e.target.value)}
                  className={inputCls}
                  placeholder="水戸 300 あ 12-34"
                />
              </label>
            </div>
          </div>

          {/* Customer info */}
          <div className="border-t border-neutral-100 pt-6">
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CUSTOMER INFO</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">顧客情報</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                <span className={labelTextCls}>顧客名</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className={inputCls}
                  placeholder="山田 太郎"
                />
              </label>

              <label className={labelCls}>
                <span className={labelTextCls}>顧客メール</span>
                <input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className={inputCls}
                  type="email"
                  placeholder="customer@example.com"
                />
              </label>

              <label className={`${labelCls} sm:col-span-2`}>
                <span className={labelTextCls}>顧客電話（マスク表示）</span>
                <input
                  value={customerPhoneMasked}
                  onChange={(e) => setCustomerPhoneMasked(e.target.value)}
                  className={inputCls}
                  placeholder="090-****-1234"
                />
              </label>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-neutral-100 pt-6">
            <div className="mb-4">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">NOTES</div>
              <div className="mt-1 text-base font-semibold text-neutral-900">メモ</div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
              placeholder="内部メモ（顧客には表示されません）"
            />
          </div>

          {/* Error */}
          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl border border-neutral-900 bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? "保存中..." : "車両を登録する"}
            </button>
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="rounded-xl border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              キャンセル
            </button>
          </div>
        </form>

      </div>
    </main>
  );
}
