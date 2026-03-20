"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";

export default function MaintenanceUrlPage() {
  const [configId, setConfigId] = useState<string | null>(null);
  const [maintenanceUrl, setMaintenanceUrl] = useState("");
  const [maintenanceLabel, setMaintenanceLabel] = useState("メンテナンス情報");
  const [showMaintenanceQr, setShowMaintenanceQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/template-options/configure");
        const j = await res.json();
        const defaultConfig = j.configs?.find((c: any) => c.is_default);
        if (defaultConfig) {
          setConfigId(defaultConfig.id);
          const footer = defaultConfig.config_json?.footer ?? {};
          setMaintenanceUrl(footer.maintenance_url ?? "");
          setMaintenanceLabel(footer.maintenance_label ?? "メンテナンス情報");
          setShowMaintenanceQr(footer.show_maintenance_qr ?? false);
        }
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!configId) {
      setMessage({ type: "error", text: "テンプレート設定が見つかりません。先にテンプレートを設定してください。" });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/template-options/maintenance-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config_id: configId,
          maintenance_url: maintenanceUrl,
          maintenance_label: maintenanceLabel,
          show_maintenance_qr: showMaintenanceQr,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setMessage({ type: "ok", text: "メンテナンスURL設定を保存しました。" });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="テンプレートオプション"
        title="メンテナンスURL設定"
        actions={
          <Link className="btn-ghost text-sm" href="/admin/template-options">
            戻る
          </Link>
        }
      />

      {message && (
        <div className={`glass-card p-3 text-sm ${message.type === "ok" ? "text-emerald-400" : "text-red-500"}`}>
          {message.text}
        </div>
      )}

      {loading && <div className="text-sm text-muted">読み込み中...</div>}

      {!loading && !configId && (
        <div className="glass-card p-4 text-sm text-muted">
          テンプレート設定が見つかりません。先に
          <Link href="/admin/template-options/gallery" className="underline text-accent">テンプレートを選択</Link>
          してください。
        </div>
      )}

      {!loading && configId && (
        <div className="glass-card p-5 space-y-4">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">
            メンテナンス案内設定
          </div>
          <div className="text-xs text-muted">
            施工証明書のフッターに表示するメンテナンス案内URLを設定します。
            QRコードを有効にすると、証明書にQRコードとして表示されます。
          </div>

          <label className="block">
            <span className="text-xs text-muted">メンテナンスURL</span>
            <input
              type="url"
              className="input-field w-full mt-1"
              value={maintenanceUrl}
              onChange={(e) => setMaintenanceUrl(e.target.value)}
              placeholder="https://example.com/maintenance-guide"
            />
            <span className="text-xs text-muted">
              メンテナンスガイドのWebページURLを入力してください
            </span>
          </label>

          <label className="block">
            <span className="text-xs text-muted">表示ラベル</span>
            <input
              type="text"
              className="input-field w-full mt-1"
              value={maintenanceLabel}
              onChange={(e) => setMaintenanceLabel(e.target.value)}
              placeholder="メンテナンス情報"
              maxLength={50}
            />
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showMaintenanceQr}
              onChange={(e) => setShowMaintenanceQr(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-primary">QRコードを証明書に表示する</span>
          </label>

          <div className="pt-2">
            <button
              type="button"
              className="btn-primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "保存中..." : "設定を保存"}
            </button>
          </div>

          <div className="text-xs text-muted space-y-1 pt-2">
            <p>※ URLを空にするとメンテナンス案内を非表示にできます。</p>
            <p>※ 紙のPDFではなくWebページ（URL）での案内を推奨します。</p>
            <p>※ QRコードは証明書フッターの右下に表示されます。</p>
          </div>
        </div>
      )}
    </div>
  );
}
