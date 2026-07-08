"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Customer = { id: string; name: string; phone: string | null };

/**
 * 車両詳細画面から「現所有者(顧客)」を手動で連携 / 変更 / 解除するコントロール。
 * 連携先は `/api/admin/customers?q=` で検索し、
 * `PUT /api/admin/vehicles/[id]/link-customer` で車両の customer_id を張り替える。
 */
export default function VehicleCustomerLink({
  vehicleId,
  initialCustomer,
}: {
  vehicleId: string;
  initialCustomer: { id: string; name: string | null } | null;
}) {
  const router = useRouter();
  const [customer, setCustomer] = useState(initialCustomer);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editing || !search.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(search)}&limit=8`);
        const j = await res.json();
        setResults(j.customers ?? []);
      } catch {
        setResults([]);
      }
    }, 300);
  }, [search, editing]);

  async function link(customerId: string | null) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/vehicles/${vehicleId}/link-customer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId }),
      });
      const j = await res.json();
      if (!res.ok) {
        setErr(j?.message ?? "連携に失敗しました。");
        return;
      }
      const linked = j?.vehicle?.customer ?? null;
      setCustomer(linked);
      setEditing(false);
      setSearch("");
      router.refresh();
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      現所有者:{" "}
      {customer?.name ? (
        <span className="text-primary">{customer.name}</span>
      ) : (
        <span className="text-muted">未設定</span>
      )}
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="ml-2 text-xs text-accent hover:underline"
        disabled={busy}
      >
        {customer ? "変更" : "連携"}
      </button>
      {customer && (
        <button
          type="button"
          onClick={() => link(null)}
          className="ml-2 text-xs text-red-500 hover:underline"
          disabled={busy}
        >
          解除
        </button>
      )}
      {editing && (
        <div className="relative mt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="顧客名・電話で検索..."
            className="input-field w-full text-sm"
            autoComplete="off"
            autoFocus
          />
          {results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border-default bg-surface shadow-md">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => link(c.id)}
                    disabled={busy}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-surface-hover disabled:opacity-50"
                  >
                    <span className="font-medium text-primary">{c.name}</span>
                    {c.phone && <span className="ml-2 text-xs text-muted">{c.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
    </div>
  );
}
