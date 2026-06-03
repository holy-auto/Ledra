"use client";

import { useEffect, useState } from "react";

interface PartnerRow {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  integration_status: string;
  is_trusted: boolean;
  agent_id: string | null;
  api_endpoint: string | null;
  api_auth_type: string;
  last_order_at: string | null;
  created_at: string;
  credentials_configured: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "審査待ち",
  active: "提携中",
  suspended: "停止",
  rejected: "却下",
};

const INTEGRATION_LABEL: Record<string, string> = {
  unconfigured: "API未設定",
  connected: "API連携済み",
  error: "連携エラー",
};

export default function SupplyPartnersClient() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 初回ロード (set-state は async コールバック内のみ = effect 内の同期 setState を避ける)。
  useEffect(() => {
    let active = true;
    fetch("/api/admin/platform/supply-partners", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json?.ok) setPartners(json.partners ?? []);
        else setMsg(json?.message ?? "読み込みに失敗しました。");
      })
      .catch(() => active && setMsg("読み込みに失敗しました。"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const toggleTrust = async (p: PartnerRow) => {
    const next = !p.is_trusted;
    setBusyId(p.id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/supply-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supply_partner_id: p.id, is_trusted: next }),
      });
      const json = await res.json();
      if (res.ok) {
        setPartners((prev) => prev.map((x) => (x.id === p.id ? { ...x, is_trusted: next } : x)));
        setMsg(json.message ?? "更新しました。");
      } else {
        setMsg(json.message ?? "更新に失敗しました。");
      }
    } catch {
      setMsg("更新に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <p className="text-sm text-secondary">読み込み中…</p>;

  return (
    <div className="space-y-4">
      {msg && (
        <div className="rounded-md border border-info-border bg-info-dim px-3 py-2 text-sm text-info-text">{msg}</div>
      )}

      {partners.length === 0 ? (
        <p className="text-sm text-secondary">
          供給パートナーはまだ登録されていません。代理店が <code>/agent</code> でプロフィール・商材・API
          連携を登録すると、ここに表示されます。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">パートナー</th>
                <th className="px-3 py-2 font-medium">ステータス</th>
                <th className="px-3 py-2 font-medium">API連携</th>
                <th className="px-3 py-2 font-medium">信頼 (auto-send)</th>
                <th className="px-3 py-2 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                // auto-send 可能な状態か (信頼付与の前提): active + API連携済み + 鍵あり。
                const apiReady =
                  p.status === "active" && p.integration_status === "connected" && p.credentials_configured;
                return (
                  <tr key={p.id} className="border-t border-default align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-primary">{p.name}</div>
                      {p.contact_email && <div className="text-xs text-secondary">{p.contact_email}</div>}
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[p.status] ?? p.status}</td>
                    <td className="px-3 py-2">
                      <span className={apiReady ? "text-success-text" : "text-secondary"}>
                        {INTEGRATION_LABEL[p.integration_status] ?? p.integration_status}
                      </span>
                      {!p.credentials_configured && p.api_auth_type !== "none" && (
                        <div className="text-xs text-secondary">鍵未設定</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {p.is_trusted ? (
                        <span className="inline-flex items-center rounded-full bg-success-dim px-2 py-0.5 text-xs font-medium text-success-text">
                          信頼済み
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-subtle px-2 py-0.5 text-xs text-secondary">
                          未信頼
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => toggleTrust(p)}
                        disabled={busyId === p.id || (!p.is_trusted && !apiReady)}
                        title={
                          !p.is_trusted && !apiReady
                            ? "API連携(active + connected + 鍵)が揃ってから信頼付与してください。"
                            : undefined
                        }
                        className={p.is_trusted ? "btn-secondary text-sm" : "btn-primary text-sm"}
                      >
                        {busyId === p.id ? "更新中…" : p.is_trusted ? "信頼を解除" : "信頼を付与"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-secondary">
        ※ is_trusted は auto-send(AI 自動発注送信)の必須ゲートです。信頼を付与しても、店舗側が opt-in
        し上限を設定し、かつパートナーが API 連携済みでなければ自動送信は行われません(壁3)。
      </p>
    </div>
  );
}
