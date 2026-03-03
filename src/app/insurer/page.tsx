"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  public_id: string;
  status: string;
  customer_name: string;
  vehicle_model: string;
  vehicle_plate: string;
  created_at: string;
  tenant_id: string;
};

export default function InsurerHomePage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    })();
  }, [supabase]);

  const runSearch = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/insurer/search?q=${encodeURIComponent(q)}&limit=50&offset=0`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "search_failed");
      setRows(j?.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "search_failed");
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/insurer/login";
  };

  const startCheckout = async () => {
    setBillingBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/insurer/checkout", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "checkout_failed");
      if (!j?.url) throw new Error("checkout_url_missing");
      window.location.href = j.url;
    } catch (e: any) {
      setErr(e?.message ?? "checkout_failed");
    } finally {
      setBillingBusy(false);
    }
  };

  if (!ready) return null;

  const exportUrl = `/api/insurer/export?q=${encodeURIComponent(q)}`;

  return (
    <main style={{ maxWidth: 1100, margin: "30px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>保険会社ポータル：証明書検索</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={startCheckout} disabled={billingBusy} style={{ padding: 10, fontWeight: 700 }}>
            {billingBusy ? "..." : "サブスク契約/更新"}
          </button>
          <button onClick={onLogout} style={{ padding: 10 }}>ログアウト</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="public_id / 顧客名 / 車両型式(model) / ナンバー(plate)"
          style={{ flex: 1, padding: 10 }}
        />
        <button onClick={runSearch} disabled={busy} style={{ padding: "10px 14px", fontWeight: 700 }}>
          {busy ? "..." : "検索"}
        </button>
        <a href={exportUrl} style={{ padding: "10px 14px", fontWeight: 700, display: "inline-block", border: "1px solid #ddd" }}>
          検索CSV
        </a>
      </div>

      {err && <div style={{ color: "crimson", marginTop: 10 }}>{err}</div>}

      <div style={{ marginTop: 16, borderTop: "1px solid #ddd" }} />

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>public_id</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>顧客名</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>車両</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>状態</th>
            <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>作成</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.public_id}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                <a href={`/insurer/c/${encodeURIComponent(r.public_id)}`} style={{ fontWeight: 700 }}>
                  {r.public_id}
                </a>
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.customer_name}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                {[r.vehicle_model, r.vehicle_plate].filter(Boolean).join(" / ")}
              </td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{r.status}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{new Date(r.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ padding: 14, opacity: 0.7 }}>
                検索結果がありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}