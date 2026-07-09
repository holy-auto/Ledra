"use client";

import { useEffect, useState } from "react";

/**
 * 供給パートナー発注の全自動送信 (opt-in) 設定カード。壁3 隣接のため既定 OFF。
 * 有効化 + 1発注上限 + 月次上限 がすべて揃って初めて、API・ポータル連携済みの提携先に
 * 限り自動送信される (それ以外は従来どおり draft → 人が承認・送信)。
 */
export default function AutoSendSettings() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [maxOrder, setMaxOrder] = useState("");
  const [monthlyCap, setMonthlyCap] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/supply/auto-send", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (j?.settings) {
          setEnabled(Boolean(j.settings.enabled));
          setMaxOrder(j.settings.max_order_jpy != null ? String(j.settings.max_order_jpy) : "");
          setMonthlyCap(j.settings.monthly_cap_jpy != null ? String(j.settings.monthly_cap_jpy) : "");
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/supply/auto-send", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          max_order_jpy: maxOrder.trim() ? Number(maxOrder) : null,
          monthly_cap_jpy: monthlyCap.trim() ? Number(monthlyCap) : null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "保存に失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: "保存しました。" });
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setSaving(false);
    }
  };

  const capsMissing = enabled && (!maxOrder.trim() || !monthlyCap.trim());

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border-subtle p-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-primary">発注の全自動送信（任意・上級）</div>
          <div className="text-xs text-muted">
            API・ポータル連携済みの提携先に限り、上限額の範囲内で発注ドラフトを自動送信します。既定はOFF。
          </div>
        </div>
        <span className="text-muted text-sm">{open ? "閉じる ▲" : "設定 ▼"}</span>
      </button>

      {open && (
        <div className="space-y-4 p-4">
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            全自動送信を有効にする
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <div className="text-xs text-muted mb-1">1発注あたり上限 (円)</div>
              <input
                type="number"
                value={maxOrder}
                onChange={(e) => setMaxOrder(e.target.value)}
                className="input-field w-full"
                placeholder="例: 50000"
              />
            </label>
            <label>
              <div className="text-xs text-muted mb-1">月次上限 (円)</div>
              <input
                type="number"
                value={monthlyCap}
                onChange={(e) => setMonthlyCap(e.target.value)}
                className="input-field w-full"
                placeholder="例: 300000"
              />
            </label>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            ※
            上限を超える発注・API/ポータル未連携・メール発注先は、自動送信されず通常どおり下書きのまま残ります（人の承認が必要）。
          </p>

          {capsMissing && (
            <div className="text-xs text-amber-500">
              有効にするには1発注上限と月次上限の両方を設定してください（未設定なら自動送信されません）。
            </div>
          )}
          {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}
