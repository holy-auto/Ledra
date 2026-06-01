"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import {
  SUPPLY_API_AUTH_TYPE_LABELS,
  SUPPLY_INTEGRATION_STATUS_LABELS,
  normalizeSupplyApiAuthType,
  type SupplyApiAuthType,
  type SupplyPartnerProfile,
} from "@/types/supply";

const AUTH_TYPES: SupplyApiAuthType[] = ["none", "api_key", "bearer", "oauth2"];

export default function SupplyIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [endpoint, setEndpoint] = useState("");
  const [authType, setAuthType] = useState<SupplyApiAuthType>("none");
  const [integrationStatus, setIntegrationStatus] = useState("unconfigured");
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  // 鍵入力は「新しい値を入れたときだけ」送る。空のままなら据え置き。
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/supply/profile", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        const partner = j?.partner as SupplyPartnerProfile | null;
        if (partner) {
          setEndpoint(partner.api_endpoint ?? "");
          setAuthType(normalizeSupplyApiAuthType(partner.api_auth_type));
          setIntegrationStatus(partner.integration_status ?? "unconfigured");
        }
        setCredentialsConfigured(Boolean(j?.credentials_configured));
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        api_endpoint: endpoint.trim() || null,
        api_auth_type: authType,
      };
      // 入力があったときだけ鍵を送る (空 = 据え置き)。
      if (apiKey.trim()) payload.api_key = apiKey.trim();
      if (apiSecret.trim()) payload.api_secret = apiSecret.trim();

      const res = await fetch("/api/supply/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "保存に失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: "保存しました。" });
      setApiKey("");
      setApiSecret("");
      // 再取得して設定状態を更新
      const r2 = await fetch("/api/supply/profile", { cache: "no-store" });
      const j2 = await r2.json().catch(() => null);
      if (j2?.partner) setIntegrationStatus(j2.partner.integration_status ?? "unconfigured");
      setCredentialsConfigured(Boolean(j2?.credentials_configured));
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-3xl p-5 text-sm text-muted">読み込み中...</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        tag="SUPPLY PORTAL"
        title="API 連携設定"
        description="発注を自動で受け取る API を設定します。未設定の場合は連絡先メールに発注が届きます。"
      />

      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">連携状況:</span>
          <span className="font-medium text-primary">
            {SUPPLY_INTEGRATION_STATUS_LABELS[integrationStatus as keyof typeof SUPPLY_INTEGRATION_STATUS_LABELS] ??
              integrationStatus}
          </span>
        </div>

        <label>
          <div className="text-sm text-secondary mb-1">認証方式</div>
          <select
            value={authType}
            onChange={(e) => setAuthType(e.target.value as SupplyApiAuthType)}
            className="input-field w-full"
          >
            {AUTH_TYPES.map((t) => (
              <option key={t} value={t}>
                {SUPPLY_API_AUTH_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        {authType !== "none" && (
          <>
            <label>
              <div className="text-sm text-secondary mb-1">API エンドポイント (https)</div>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="input-field w-full"
                placeholder="https://api.example.com/v1/orders"
              />
            </label>

            <label>
              <div className="text-sm text-secondary mb-1">
                API キー {credentialsConfigured && <span className="text-emerald-500">(設定済み)</span>}
              </div>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="input-field w-full"
                placeholder={credentialsConfigured ? "変更する場合のみ入力" : "新しいキーを入力"}
                autoComplete="new-password"
              />
            </label>

            {authType === "oauth2" && (
              <label>
                <div className="text-sm text-secondary mb-1">API シークレット</div>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="input-field w-full"
                  placeholder={credentialsConfigured ? "変更する場合のみ入力" : "新しいシークレットを入力"}
                  autoComplete="new-password"
                />
              </label>
            )}

            <p className="text-xs text-muted">
              入力されたキーは暗号化して保管され、画面には二度と表示されません。空欄のまま保存すると既存の値が維持されます。
            </p>
          </>
        )}

        {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
