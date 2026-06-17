"use client";

/**
 * メーカー受注ポータル — 受信トレイ。
 * 全提携ショップ横断で自分宛てのポータル発注を一覧し、受注/一部欠品/辞退を回答する。
 * バックエンド: GET /api/agent/supply/orders, GET/POST .../orders/[id](/respond)。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SUPPLY_PARTNER_RESPONSE_LABELS,
  SUPPLY_DECLINE_REASON_LABELS,
  type SupplyPartnerResponse,
  type SupplyDeclineReason,
} from "@/types/supply";

type OrderRow = {
  id: string;
  po_number: string | null;
  subtotal: number;
  status: string;
  partner_response: SupplyPartnerResponse;
  partner_ship_eta: string | null;
  created_at: string;
  shop_name: string | null;
};

type OrderItem = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number | null;
  amount: number;
  accepted_quantity: number | null;
  backorder_quantity: number | null;
};

type OrderDetail = OrderRow & {
  note: string | null;
  partner_responded_at: string | null;
  partner_tracking_no: string | null;
  partner_response_note: string | null;
  decline_reason: SupplyDeclineReason | null;
  items: OrderItem[];
};

const TABS: { key: "all" | SupplyPartnerResponse; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "pending", label: "回答待ち" },
  { key: "accepted", label: "受注" },
  { key: "partial", label: "一部欠品" },
  { key: "declined", label: "辞退" },
];

const yen = (n: number) => `¥${(n ?? 0).toLocaleString("ja-JP")}`;

function ResponseBadge({ r }: { r: SupplyPartnerResponse }) {
  const cls: Record<SupplyPartnerResponse, string> = {
    pending: "bg-amber-500/15 text-amber-600",
    accepted: "bg-emerald-500/15 text-emerald-600",
    partial: "bg-orange-500/15 text-orange-600",
    declined: "bg-red-500/15 text-red-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls[r]}`}>
      {SUPPLY_PARTNER_RESPONSE_LABELS[r]}
    </span>
  );
}

export default function SupplyOrdersInboxPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | SupplyPartnerResponse>("all");
  const [selected, setSelected] = useState<OrderDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agent/supply/orders", { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (j?.ok) setOrders(j.orders as OrderRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 初回ロードは setState を await 後に行い、effect 内の同期 setState を避ける。
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/agent/supply/orders", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (active && j?.ok) setOrders(j.orders as OrderRow[]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () => (tab === "all" ? orders : orders.filter((o) => o.partner_response === tab)),
    [orders, tab],
  );

  const openDetail = async (id: string) => {
    const res = await fetch(`/api/agent/supply/orders/${id}`, { cache: "no-store" });
    const j = await res.json().catch(() => null);
    if (j?.ok) setSelected(j.order as OrderDetail);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-primary">受注ポータル</h1>
        <p className="text-xs text-muted">提携先からの発注を確認し、受注・一部欠品・辞退を回答できます。</p>
      </div>

      <LineLinkCard />

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-full px-3 py-1 text-sm ${
              tab === t.key ? "bg-blue-600 text-white" : "bg-surface-subtle text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center text-sm text-muted">読み込み中...</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">該当する発注はありません。</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => void openDetail(o.id)}
              className="glass-card flex w-full items-center justify-between p-4 text-left hover:bg-surface-subtle"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-primary">{o.shop_name ?? "提携先"}</span>
                  <ResponseBadge r={o.partner_response} />
                </div>
                <div className="text-xs text-muted">
                  {o.po_number ?? o.id.slice(0, 8)} ・ {new Date(o.created_at).toLocaleDateString("ja-JP")}
                  {o.partner_ship_eta ? ` ・ 出荷予定 ${o.partner_ship_eta}` : ""}
                </div>
              </div>
              <div className="shrink-0 font-semibold text-primary">{yen(o.subtotal)}</div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <OrderDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onResponded={() => {
            setSelected(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function LineLinkCard() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [addUrl, setAddUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const issue = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/agent/supply/line-link", { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setErr(j?.message ?? "コードの発行に失敗しました。");
        return;
      }
      setCode(j.code as string);
      setAddUrl((j.add_url as string | null) ?? null);
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border-subtle p-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-primary">LINEで発注通知を受け取る（任意）</div>
          <div className="text-xs text-muted">Ledra公式LINEを友だち追加し、発行コードを送ると通知が届きます。</div>
        </div>
        <span className="text-sm text-muted">{open ? "閉じる ▲" : "設定 ▼"}</span>
      </button>
      {open && (
        <div className="space-y-3 p-4 text-sm">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-secondary">
            <li>下の「連携コードを発行」を押す。</li>
            <li>Ledra公式LINEを友だち追加する{addUrl ? "（下のボタン）" : ""}。</li>
            <li>トークにコードを送信すると連携完了。</li>
          </ol>
          {code ? (
            <div className="rounded-lg bg-surface-subtle p-3 text-center">
              <div className="text-xs text-muted">連携コード（30分有効）</div>
              <div className="font-mono text-2xl font-bold tracking-widest text-primary">{code}</div>
            </div>
          ) : (
            <button type="button" onClick={() => void issue()} disabled={loading} className="btn-primary text-sm">
              {loading ? "発行中..." : "連携コードを発行"}
            </button>
          )}
          {addUrl && (
            <a
              href={addUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-blue-500 underline"
            >
              Ledra公式LINEを友だち追加
            </a>
          )}
          {err && <div className="text-xs text-red-500">{err}</div>}
        </div>
      )}
    </div>
  );
}

function OrderDetailModal({
  order,
  onClose,
  onResponded,
}: {
  order: OrderDetail;
  onClose: () => void;
  onResponded: () => void;
}) {
  const respondable = order.status === "sent";
  const [mode, setMode] = useState<null | "accept" | "partial" | "decline">(null);
  const [accepted, setAccepted] = useState<Record<string, string>>(
    Object.fromEntries(order.items.map((it) => [it.id, String(it.quantity)])),
  );
  const [shipEta, setShipEta] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [declineReason, setDeclineReason] = useState<SupplyDeclineReason>("out_of_stock");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!mode) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { action: mode, note: note.trim() || null };
      if (mode === "partial") {
        body.lines = order.items.map((it) => ({ item_id: it.id, accepted_quantity: Number(accepted[it.id] ?? 0) }));
      }
      if (mode !== "decline") {
        body.ship_eta = shipEta.trim() || null;
        body.tracking_no = trackingNo.trim() || null;
      }
      if (mode === "decline") body.decline_reason = declineReason;

      const res = await fetch(`/api/agent/supply/orders/${order.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setErr(j?.message ?? "回答の送信に失敗しました。");
        return;
      }
      onResponded();
    } catch {
      setErr("通信エラーが発生しました。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="glass-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="font-semibold text-primary">{order.shop_name ?? "提携先"}</div>
            <div className="text-xs text-muted">{order.po_number ?? order.id.slice(0, 8)}</div>
          </div>
          <ResponseBadge r={order.partner_response} />
        </div>

        <div className="space-y-1 border-y border-border-subtle py-3">
          {order.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between text-sm">
              <span className="text-secondary">
                {it.name}
                {it.sku ? <span className="text-muted"> ({it.sku})</span> : null} × {it.quantity}
              </span>
              <span className="text-muted">{it.unit_cost != null ? yen(it.unit_cost) : "—"}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 text-sm font-semibold text-primary">
            <span>小計</span>
            <span>{yen(order.subtotal)}</span>
          </div>
        </div>

        {!respondable ? (
          <p className="mt-3 text-sm text-muted">
            この発注は現在回答できません（状態: {order.status}）。
            {order.partner_response !== "pending" &&
              `回答済み: ${SUPPLY_PARTNER_RESPONSE_LABELS[order.partner_response]}`}
          </p>
        ) : mode === null ? (
          <div className="mt-4 grid grid-cols-1 gap-2">
            <button type="button" onClick={() => setMode("accept")} className="btn-primary text-sm">
              ✅ この内容で受注する
            </button>
            <button
              type="button"
              onClick={() => setMode("partial")}
              className="rounded-lg border border-border-subtle py-2 text-sm text-secondary"
            >
              ⚠️ 一部欠品・数量変更で回答
            </button>
            <button
              type="button"
              onClick={() => setMode("decline")}
              className="rounded-lg border border-border-subtle py-2 text-sm text-red-500"
            >
              ❌ お受けできない
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {mode === "partial" && (
              <div className="space-y-2">
                <div className="text-xs text-muted">受注できる数量を入力してください（欠品分は差し戻されます）。</div>
                {order.items.map((it) => (
                  <label key={it.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-secondary">{it.name}</span>
                    <span className="flex items-center gap-1 text-muted">
                      <input
                        type="number"
                        min={0}
                        max={it.quantity}
                        value={accepted[it.id] ?? ""}
                        onChange={(e) => setAccepted((p) => ({ ...p, [it.id]: e.target.value }))}
                        className="input-field w-20 text-right"
                      />
                      / {it.quantity}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {mode === "decline" && (
              <label className="block">
                <div className="mb-1 text-xs text-muted">辞退の理由</div>
                <select
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value as SupplyDeclineReason)}
                  className="input-field w-full"
                >
                  {(Object.keys(SUPPLY_DECLINE_REASON_LABELS) as SupplyDeclineReason[]).map((k) => (
                    <option key={k} value={k}>
                      {SUPPLY_DECLINE_REASON_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {mode !== "decline" && (
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <div className="mb-1 text-xs text-muted">出荷予定日（任意）</div>
                  <input
                    type="date"
                    value={shipEta}
                    onChange={(e) => setShipEta(e.target.value)}
                    className="input-field w-full"
                  />
                </label>
                <label>
                  <div className="mb-1 text-xs text-muted">追跡番号（任意）</div>
                  <input
                    value={trackingNo}
                    onChange={(e) => setTrackingNo(e.target.value)}
                    className="input-field w-full"
                  />
                </label>
              </div>
            )}

            <label className="block">
              <div className="mb-1 text-xs text-muted">メモ（任意）</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="input-field w-full"
              />
            </label>

            {err && <div className="text-sm text-red-500">{err}</div>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                className="rounded-lg border border-border-subtle px-3 py-2 text-sm text-secondary"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving}
                className="btn-primary flex-1 text-sm"
              >
                {saving ? "送信中..." : "回答を送信"}
              </button>
            </div>
          </div>
        )}

        <button type="button" onClick={onClose} className="mt-4 w-full text-center text-xs text-muted">
          閉じる
        </button>
      </div>
    </div>
  );
}
