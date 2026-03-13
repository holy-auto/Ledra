"use client";

import { useState } from "react";
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

  return (
    <div className="p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-primary">車両を登録</h1>
          <p className="text-sm text-muted">CARTRUST RECORD の車両マスターを登録します。</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 glass-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">メーカー *</div>
              <input
                value={maker}
                onChange={(e) => setMaker(e.target.value)}
                className="input-field w-full"
                required
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">車種 *</div>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="input-field w-full"
                required
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">年式</div>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="input-field w-full"
                inputMode="numeric"
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">ナンバー表示</div>
              <input
                value={plateDisplay}
                onChange={(e) => setPlateDisplay(e.target.value)}
                className="input-field w-full"
                placeholder="水戸 300 あ 12-34"
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">顧客名</div>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="input-field w-full"
              />
            </label>

            <label className="space-y-2">
              <div className="text-sm font-medium text-primary">顧客メール</div>
              <input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="input-field w-full"
                type="email"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <div className="text-sm font-medium text-primary">顧客電話（マスク表示）</div>
              <input
                value={customerPhoneMasked}
                onChange={(e) => setCustomerPhoneMasked(e.target.value)}
                className="input-field w-full"
                placeholder="090-****-1234"
              />
            </label>
          </div>

          <label className="space-y-2 block">
            <div className="text-sm font-medium text-primary">メモ</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field min-h-[120px] w-full"
            />
          </label>

          {err ? (
            <div className="rounded-xl border border-red-500/30 bg-[rgba(239,68,68,0.1)] p-3 text-sm text-red-500">
              {err}
            </div>
          ) : null}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={busy}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? "保存中..." : "保存する"}
            </button>
            <button
              type="button"
              onClick={() => router.push(returnTo)}
              className="btn-secondary"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
