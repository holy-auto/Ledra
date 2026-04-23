"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import type { TemplateConfig, PlatformTemplateRow } from "@/types/templateOption";

const DEFAULT_CONFIG: TemplateConfig = {
  version: 1,
  branding: {
    company_name: "",
    logo_position: "top-left",
    logo_max_height: 40,
  },
  header: { title: "施工証明書", show_issue_date: true, show_certificate_no: true },
  body: { show_customer_name: true, show_vehicle_info: true, show_service_details: true, show_photos: true },
  footer: { show_qr: true, show_ledra_badge: true, maintenance_label: "メンテナンス情報" },
  style: { font_family: "noto-sans-jp", border_style: "simple", background_variant: "white" },
};

export default function ConfigurePage() {
  const searchParams = useSearchParams();
  const platformTemplateId = searchParams?.get("platform_template_id") ?? null;
  const configId = searchParams?.get("id") ?? null;

  const [config, setConfig] = useState<TemplateConfig>(DEFAULT_CONFIG);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [savedConfigId, setSavedConfigId] = useState<string | null>(configId);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // 既存config or platformテンプレのbase_configを読み込み
  useEffect(() => {
    (async () => {
      if (configId) {
        const res = await fetch("/api/template-options/configure");
        const j = await res.json();
        const found = j.configs?.find((c: any) => c.id === configId);
        if (found) {
          setConfig(found.config_json);
          setName(found.name ?? "");
        }
      } else if (platformTemplateId) {
        const res = await fetch("/api/template-options/gallery");
        const j = await res.json();
        const tpl = j.templates?.find((t: any) => t.id === platformTemplateId);
        if (tpl) {
          setConfig({ ...DEFAULT_CONFIG, ...tpl.base_config });
          setName(tpl.name);
        }
      }
    })();
  }, [configId, platformTemplateId]);

  const updateBranding = (key: string, value: unknown) => {
    setConfig((prev: TemplateConfig) => ({
      ...prev,
      branding: { ...prev.branding, [key]: value },
    }));
  };

  const updateFooter = (key: string, value: unknown) => {
    setConfig((prev: TemplateConfig) => ({
      ...prev,
      footer: { ...(prev.footer ?? {}), [key]: value },
    }));
  };

  const updateStyle = (key: string, value: unknown) => {
    setConfig((prev: TemplateConfig) => ({
      ...prev,
      style: { ...(prev.style ?? {}), [key]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/template-options/configure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform_template_id: platformTemplateId,
          config,
          name: name || config.branding.company_name,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setSavedConfigId(j.config_id);
      setMessage({ type: "ok", text: "保存しました" });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!savedConfigId) return;
    setPublishing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/template-options/configure", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config_id: savedConfigId, is_active: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      setMessage({ type: "ok", text: "テンプレートを公開しました" });
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message ?? String(e) });
    } finally {
      setPublishing(false);
    }
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/template-options/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const j = await res.json().catch((): null => null);
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message ?? String(e) });
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="テンプレートオプション"
        title="テンプレート設定"
        actions={
          <Link className="btn-ghost text-sm" href="/admin/template-options">
            戻る
          </Link>
        }
      />

      {message && (
        <div className={`glass-card p-3 text-sm ${message.type === "ok" ? "text-success" : "text-danger"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左: 設定フォーム */}
        <div className="space-y-4">
          {/* テンプレート名 */}
          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">基本情報</div>
            <label className="block">
              <span className="text-xs text-muted">テンプレート名</span>
              <input
                type="text"
                className="input-field w-full mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: プレミアムブラック（自社カスタム）"
              />
            </label>
          </div>

          {/* ブランディング */}
          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">ブランド情報</div>
            <label className="block">
              <span className="text-xs text-muted">社名（必須）</span>
              <input
                type="text"
                className="input-field w-full mt-1"
                value={config.branding.company_name}
                onChange={(e) => updateBranding("company_name", e.target.value)}
                placeholder="株式会社○○"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">住所</span>
              <input
                type="text"
                className="input-field w-full mt-1"
                value={config.branding.company_address ?? ""}
                onChange={(e) => updateBranding("company_address", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">電話番号</span>
              <input
                type="text"
                className="input-field w-full mt-1"
                value={config.branding.company_phone ?? ""}
                onChange={(e) => updateBranding("company_phone", e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">ウェブサイトURL</span>
              <input
                type="url"
                className="input-field w-full mt-1"
                value={config.branding.company_url ?? ""}
                onChange={(e) => updateBranding("company_url", e.target.value)}
              />
            </label>
          </div>

          {/* カラー設定 */}
          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">カラー設定</div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-muted">プライマリ</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    className="w-8 h-8 rounded cursor-pointer"
                    value={config.branding.primary_color ?? "#1a1a2e"}
                    onChange={(e) => updateBranding("primary_color", e.target.value)}
                  />
                  <input
                    type="text"
                    className="input-field flex-1 text-xs"
                    value={config.branding.primary_color ?? "#1a1a2e"}
                    onChange={(e) => updateBranding("primary_color", e.target.value)}
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-muted">セカンダリ</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    className="w-8 h-8 rounded cursor-pointer"
                    value={config.branding.secondary_color ?? "#16213e"}
                    onChange={(e) => updateBranding("secondary_color", e.target.value)}
                  />
                  <input
                    type="text"
                    className="input-field flex-1 text-xs"
                    value={config.branding.secondary_color ?? "#16213e"}
                    onChange={(e) => updateBranding("secondary_color", e.target.value)}
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs text-muted">アクセント</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    className="w-8 h-8 rounded cursor-pointer"
                    value={config.branding.accent_color ?? "#0071e3"}
                    onChange={(e) => updateBranding("accent_color", e.target.value)}
                  />
                  <input
                    type="text"
                    className="input-field flex-1 text-xs"
                    value={config.branding.accent_color ?? "#0071e3"}
                    onChange={(e) => updateBranding("accent_color", e.target.value)}
                  />
                </div>
              </label>
            </div>
          </div>

          {/* ロゴ設定 */}
          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">ロゴ設定</div>
            <LogoUploader
              configId={savedConfigId}
              currentLogoId={config.branding.logo_asset_id}
              onUploaded={(assetId) => updateBranding("logo_asset_id", assetId)}
            />
            <label className="block">
              <span className="text-xs text-muted">ロゴ位置</span>
              <select
                className="input-field w-full mt-1"
                value={config.branding.logo_position ?? "top-left"}
                onChange={(e) => updateBranding("logo_position", e.target.value)}
              >
                <option value="top-left">左上</option>
                <option value="top-center">中央上</option>
                <option value="top-right">右上</option>
              </select>
            </label>
            <div className="text-xs text-muted">※ PNG, JPEG, SVG, WebP（2MB以下）に対応しています。</div>
          </div>

          {/* スタイル */}
          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">デザインスタイル</div>
            <label className="block">
              <span className="text-xs text-muted">枠線スタイル</span>
              <select
                className="input-field w-full mt-1"
                value={config.style?.border_style ?? "simple"}
                onChange={(e) => updateStyle("border_style", e.target.value)}
              >
                <option value="none">なし</option>
                <option value="simple">シンプル</option>
                <option value="double">二重線</option>
                <option value="elegant">エレガント</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted">背景</span>
              <select
                className="input-field w-full mt-1"
                value={config.style?.background_variant ?? "white"}
                onChange={(e) => updateStyle("background_variant", e.target.value)}
              >
                <option value="white">ホワイト</option>
                <option value="cream">クリーム</option>
                <option value="light-gray">ライトグレー</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted">フォント</span>
              <select
                className="input-field w-full mt-1"
                value={config.style?.font_family ?? "noto-sans-jp"}
                onChange={(e) => updateStyle("font_family", e.target.value)}
              >
                <option value="noto-sans-jp">ゴシック体（Noto Sans JP）</option>
                <option value="noto-serif-jp">明朝体（Noto Serif JP）</option>
              </select>
              <span className="text-xs text-muted">※ フォント変更はプレミアムプランのみ有効です</span>
            </label>
          </div>

          {/* フッター文言 */}
          <div className="glass-card p-4 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">フッター文言</div>
            <label className="block">
              <span className="text-xs text-muted">保証文言</span>
              <textarea
                className="input-field w-full mt-1 min-h-[80px]"
                value={config.footer?.warranty_text ?? ""}
                onChange={(e) => updateFooter("warranty_text", e.target.value)}
                maxLength={500}
                placeholder="例: 本施工は当社基準に基づき施工されたことを証明いたします。"
              />
              <span className="text-xs text-muted">{(config.footer?.warranty_text ?? "").length}/500</span>
            </label>
            <label className="block">
              <span className="text-xs text-muted">注意文言</span>
              <textarea
                className="input-field w-full mt-1 min-h-[60px]"
                value={config.footer?.notice_text ?? ""}
                onChange={(e) => updateFooter("notice_text", e.target.value)}
                maxLength={500}
                placeholder="例: 保証適用には定期メンテナンスの実施が必要です。"
              />
              <span className="text-xs text-muted">{(config.footer?.notice_text ?? "").length}/500</span>
            </label>
          </div>
        </div>

        {/* 右: アクション */}
        <div className="space-y-4">
          <div className="glass-card p-4 space-y-3 sticky top-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">操作</div>
            <button type="button" className="btn-secondary w-full" disabled={previewing} onClick={handlePreview}>
              {previewing ? "生成中..." : "プレビュー（PDF）"}
            </button>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={saving || !config.branding.company_name}
              onClick={handleSave}
            >
              {saving ? "保存中..." : "設定を保存"}
            </button>
            {savedConfigId && (
              <button
                type="button"
                className="btn-primary w-full bg-success hover:bg-success/90"
                disabled={publishing}
                onClick={handlePublish}
              >
                {publishing ? "公開中..." : "テンプレートを公開"}
              </button>
            )}
            <div className="text-xs text-muted space-y-1 pt-2">
              <p>※ 保存後にプレビューで確認し、問題なければ「公開」してください。</p>
              <p>※ 公開すると、以降の証明書発行でこのテンプレートが使用されます。</p>
              <p>※ 保証文言・注意文言の法的妥当性は加盟店様にてご確認ください。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogoUploader({
  configId,
  currentLogoId,
  onUploaded,
}: {
  configId: string | null;
  currentLogoId?: string;
  onUploaded: (assetId: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(!!currentLogoId);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (configId) fd.append("config_id", configId);

      const res = await fetch("/api/template-options/upload-logo", {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);

      onUploaded(j.asset_id);
      setUploaded(true);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="text-xs text-muted">ロゴ画像</span>
        <div className="mt-1 flex items-center gap-3">
          <label className="btn-secondary text-xs cursor-pointer">
            {uploading ? "アップロード中..." : uploaded ? "ロゴを変更" : "ロゴをアップロード"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={handleUpload}
            />
          </label>
          {uploaded && <span className="text-xs text-success">アップロード済み</span>}
        </div>
      </label>
      {error && <div className="text-xs text-danger">{error}</div>}
    </div>
  );
}
