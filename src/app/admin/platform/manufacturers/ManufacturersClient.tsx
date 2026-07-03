"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ManufacturerRow,
  ManufacturerTemplateRow,
  ManufacturerCertifiedTenantRow,
  ManufacturerServiceType,
} from "@/types/manufacturer";
import { MANUFACTURER_SERVICE_TYPE_LABELS, MANUFACTURER_CERTIFICATION_STATUS_LABELS } from "@/types/manufacturer";

type CertificationWithTenant = ManufacturerCertifiedTenantRow & {
  tenants: { id: string; name: string; slug: string | null } | null;
};

const SERVICE_TYPE_OPTIONS: ManufacturerServiceType[] = ["coating", "ppf", "maintenance", "body_repair", "general"];

const DEFAULT_CONFIG_JSON = JSON.stringify(
  {
    version: 1,
    branding: {
      company_name: "",
      primary_color: "#1a1a2e",
      accent_color: "#0071e3",
      logo_position: "top-left",
    },
    header: { title: "施工証明書", show_issue_date: true, show_certificate_no: true },
    body: { show_customer_name: true, show_vehicle_info: true, show_service_details: true },
    footer: { show_qr: true, show_ledra_badge: true },
    style: { font_family: "noto-sans-jp", border_style: "simple", background_variant: "white" },
  },
  null,
  2,
);

export default function ManufacturersClient() {
  const [manufacturers, setManufacturers] = useState<ManufacturerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [globalMsg, setGlobalMsg] = useState<string | null>(null);

  const fetchManufacturers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (includeInactive) params.set("include_inactive", "1");
      const res = await fetch(`/api/admin/platform/manufacturers?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setManufacturers(json.manufacturers ?? []);
      else setGlobalMsg(json.message ?? "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManufacturers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  const selected = useMemo(() => manufacturers.find((m) => m.id === selectedId) ?? null, [manufacturers, selectedId]);

  return (
    <div className="space-y-6">
      {globalMsg && (
        <div className="rounded-md border border-warning-border bg-warning-dim px-3 py-2 text-sm text-warning-text">
          {globalMsg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="メーカー名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchManufacturers()}
          className="input-field max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          無効化済みも表示
        </label>
        <button onClick={fetchManufacturers} className="btn-secondary text-sm">
          再読み込み
        </button>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          ＋ 新規メーカー登録
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : manufacturers.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center text-sm text-secondary">
          まだメーカーが登録されていません。「＋ 新規メーカー登録」から追加してください。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {manufacturers.map((m) => (
            <ManufacturerCard
              key={m.id}
              manufacturer={m}
              onSelect={() => setSelectedId(m.id)}
              onUpdated={fetchManufacturers}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateManufacturerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchManufacturers();
          }}
        />
      )}

      {selected && (
        <ManufacturerDetailModal
          manufacturer={selected}
          onClose={() => setSelectedId(null)}
          onChanged={fetchManufacturers}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function ManufacturerCard({
  manufacturer,
  onSelect,
  onUpdated,
}: {
  manufacturer: ManufacturerRow;
  onSelect: () => void;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleActive = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: manufacturer.id, is_active: !manufacturer.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "更新に失敗しました。");
      onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-primary">{manufacturer.name}</h3>
            {!manufacturer.is_active && (
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-secondary">無効</span>
            )}
          </div>
          {manufacturer.slug && <div className="text-xs text-secondary">slug: {manufacturer.slug}</div>}
          {manufacturer.description && (
            <p className="text-sm text-secondary line-clamp-2">{manufacturer.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <button onClick={onSelect} className="btn-secondary text-xs">
            詳細・テンプレ・認定先
          </button>
          <button onClick={toggleActive} disabled={busy} className="btn-secondary text-xs">
            {manufacturer.is_active ? "無効化" : "有効化"}
          </button>
          {err && <p className="text-xs text-danger-text">{err}</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

function CreateManufacturerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug || undefined,
          description: description || undefined,
          website_url: websiteUrl || undefined,
          contact_email: contactEmail || undefined,
          contact_phone: contactPhone || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "登録に失敗しました。");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登録に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="新規メーカー登録" onClose={onClose}>
      <div className="space-y-3">
        <Field label="メーカー名 *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field w-full"
            placeholder="例: ◯◯コーティング株式会社"
          />
        </Field>
        <Field label="slug (任意・英小文字+数字+ハイフン)">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="input-field w-full"
            placeholder="例: example-coating"
          />
        </Field>
        <Field label="説明">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field w-full"
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Web サイト URL">
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              className="input-field w-full"
              placeholder="https://..."
            />
          </Field>
          <Field label="連絡先メール">
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="input-field w-full"
              placeholder="info@..."
            />
          </Field>
          <Field label="連絡先電話">
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="input-field w-full"
            />
          </Field>
        </div>
        {err && <div className="text-sm text-danger-text">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary text-sm">
            キャンセル
          </button>
          <button onClick={submit} disabled={busy || !name.trim()} className="btn-primary text-sm">
            登録
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Detail modal: edit + templates + certifications
// ---------------------------------------------------------------------------

function ManufacturerDetailModal({
  manufacturer,
  onClose,
  onChanged,
}: {
  manufacturer: ManufacturerRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"info" | "templates" | "certifications" | "members">("info");

  return (
    <Modal title={`${manufacturer.name} — メーカー設定`} onClose={onClose} wide>
      <div className="border-b border-border-subtle">
        <nav className="flex gap-1">
          {[
            ["info", "基本情報"],
            ["templates", "デザインテンプレート"],
            ["certifications", "認定施工店"],
            ["members", "ポータルメンバー"],
          ].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={`px-3 py-2 text-sm font-medium ${
                tab === k ? "border-b-2 border-accent text-primary" : "text-secondary hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="pt-4">
        {tab === "info" && <ManufacturerInfoTab manufacturer={manufacturer} onChanged={onChanged} />}
        {tab === "templates" && <TemplatesTab manufacturer={manufacturer} />}
        {tab === "certifications" && <CertificationsTab manufacturer={manufacturer} />}
        {tab === "members" && <MembersTab manufacturer={manufacturer} />}
      </div>
    </Modal>
  );
}

function ManufacturerInfoTab({ manufacturer, onChanged }: { manufacturer: ManufacturerRow; onChanged: () => void }) {
  const [name, setName] = useState(manufacturer.name);
  const [slug, setSlug] = useState(manufacturer.slug ?? "");
  const [description, setDescription] = useState(manufacturer.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(manufacturer.website_url ?? "");
  const [contactEmail, setContactEmail] = useState(manufacturer.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(manufacturer.contact_phone ?? "");
  const [logoPath, setLogoPath] = useState(manufacturer.logo_asset_path ?? "");
  const [isActive, setIsActive] = useState(manufacturer.is_active);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: manufacturer.id,
          name,
          slug: slug || null,
          description: description || null,
          website_url: websiteUrl || null,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          logo_asset_path: logoPath || null,
          is_active: isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "更新に失敗しました。");
      setMsg("保存しました。");
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="メーカー名">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" />
        </Field>
        <Field label="slug">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} className="input-field w-full" />
        </Field>
      </div>
      <Field label="説明">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input-field w-full"
          rows={2}
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Web サイト URL">
          <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className="input-field w-full" />
        </Field>
        <Field label="ロゴ asset path (Storage)">
          <div className="flex flex-col gap-2">
            <input
              value={logoPath}
              onChange={(e) => setLogoPath(e.target.value)}
              className="input-field w-full"
              placeholder="manufacturers/<id>/logo.png"
            />
            <AssetUploader
              label="PNGをアップロード"
              kind="manufacturer_logo"
              manufacturerId={manufacturer.id}
              onUploaded={setLogoPath}
            />
          </div>
        </Field>
        <Field label="連絡先メール">
          <input
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="input-field w-full"
          />
        </Field>
        <Field label="連絡先電話">
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="input-field w-full"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        有効
      </label>
      {msg && <div className="text-sm text-secondary">{msg}</div>}
      <div className="flex justify-end">
        <button onClick={save} disabled={busy || !name.trim()} className="btn-primary text-sm">
          保存
        </button>
      </div>
    </div>
  );
}

// ---- Templates tab --------------------------------------------------------

function TemplatesTab({ manufacturer }: { manufacturer: ManufacturerRow }) {
  const [templates, setTemplates] = useState<ManufacturerTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/platform/manufacturers/templates?manufacturer_id=${manufacturer.id}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setTemplates(json.templates ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturer.id]);

  const editing = templates.find((t) => t.id === editingId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">
          各テンプレートはメーカー協議で固定するデザインです。施工店側はカスタマイズできません。
        </p>
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
          ＋ テンプレート追加
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : templates.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface p-4 text-sm text-secondary">
          まだテンプレートがありません。
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-primary">{t.name}</span>
                  {t.service_type && (
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-secondary">
                      {MANUFACTURER_SERVICE_TYPE_LABELS[t.service_type]}
                    </span>
                  )}
                  {!t.is_active && (
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-secondary">非公開</span>
                  )}
                </div>
                {t.description && <div className="text-xs text-secondary">{t.description}</div>}
              </div>
              <button onClick={() => setEditingId(t.id)} className="btn-secondary text-xs">
                編集
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <TemplateEditor
          manufacturerId={manufacturer.id}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
      {editing && (
        <TemplateEditor
          manufacturerId={manufacturer.id}
          template={editing}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function TemplateEditor({
  manufacturerId,
  template,
  onClose,
  onSaved,
}: {
  manufacturerId: string;
  template?: ManufacturerTemplateRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !template;
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [serviceType, setServiceType] = useState<ManufacturerServiceType | "">(template?.service_type ?? "");
  const [layoutKey, setLayoutKey] = useState(template?.layout_key ?? "standard");
  const [thumbnailPath, setThumbnailPath] = useState(template?.thumbnail_path ?? "");
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(template?.sort_order ?? 0);
  const [configText, setConfigText] = useState(
    template ? JSON.stringify(template.config_json, null, 2) : DEFAULT_CONFIG_JSON,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      let configJson: unknown;
      try {
        configJson = JSON.parse(configText);
      } catch {
        throw new Error("config_json が正しい JSON ではありません。");
      }

      const payload: Record<string, unknown> = {
        name,
        description: description || null,
        service_type: serviceType || null,
        layout_key: layoutKey,
        thumbnail_path: thumbnailPath || null,
        is_active: isActive,
        sort_order: sortOrder,
        config_json: configJson,
      };

      const res = await fetch("/api/admin/platform/manufacturers/templates", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew ? { ...payload, manufacturer_id: manufacturerId } : { ...payload, id: template!.id },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "保存に失敗しました。");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isNew ? "テンプレート追加" : "テンプレート編集"} onClose={onClose} wide>
      <div className="space-y-3">
        <Field label="テンプレート名 *">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-field w-full" />
        </Field>
        <Field label="説明">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-field w-full"
            rows={2}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="サービス種別">
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ManufacturerServiceType | "")}
              className="select-field w-full"
            >
              <option value="">指定なし</option>
              {SERVICE_TYPE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {MANUFACTURER_SERVICE_TYPE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="layout_key">
            <input value={layoutKey} onChange={(e) => setLayoutKey(e.target.value)} className="input-field w-full" />
          </Field>
          <Field label="表示順">
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              className="input-field w-full"
            />
          </Field>
        </div>
        <Field label="サムネイル asset path">
          <div className="flex flex-col gap-2">
            <input
              value={thumbnailPath}
              onChange={(e) => setThumbnailPath(e.target.value)}
              className="input-field w-full"
              placeholder="manufacturers/<id>/templates/<template-id>/thumbnail.png"
            />
            {template ? (
              <AssetUploader
                label="サムネイルPNGをアップロード"
                kind="manufacturer_template_thumbnail"
                manufacturerId={manufacturerId}
                templateId={template.id}
                onUploaded={setThumbnailPath}
              />
            ) : (
              <p className="text-xs text-secondary">テンプレートを一度保存してからサムネイルをアップロードできます。</p>
            )}
          </div>
        </Field>
        <Field label="config_json (renderBrandedCertificatePdf 互換)">
          <textarea
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
            className="input-field w-full font-mono text-xs"
            rows={14}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          有効 (施工店の発行時ピッカーに表示)
        </label>
        {err && <div className="text-sm text-danger-text">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary text-sm">
            キャンセル
          </button>
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary text-sm">
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Certifications tab ---------------------------------------------------

function CertificationsTab({ manufacturer }: { manufacturer: ManufacturerRow }) {
  const [certs, setCerts] = useState<CertificationWithTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [tenantQuery, setTenantQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [notes, setNotes] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ manufacturer_id: manufacturer.id });
      if (includeRevoked) params.set("include_revoked", "1");
      const res = await fetch(`/api/admin/platform/manufacturers/certifications?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setCerts(json.certifications ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturer.id, includeRevoked]);

  const searchTenants = async () => {
    if (!tenantQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/platform/tenants?q=${encodeURIComponent(tenantQuery)}&status=active`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setResults((json.tenants ?? []).map((t: { id: string; name: string }) => t));
    } finally {
      setSearching(false);
    }
  };

  const grant = async (tenantId: string) => {
    setBusyId(tenantId);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers/certifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer_id: manufacturer.id,
          tenant_id: tenantId,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "認定に失敗しました。");
      setMsg("認定を登録しました。");
      setNotes("");
      setResults([]);
      setTenantQuery("");
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "認定に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("この認定を解除します。よろしいですか？")) return;
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers/certifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "解除に失敗しました。");
      setMsg("認定を解除しました。");
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "解除に失敗しました。");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border-subtle bg-surface-hover p-3">
        <div className="text-sm font-medium text-primary mb-2">認定施工店を追加</div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tenantQuery}
            onChange={(e) => setTenantQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchTenants()}
            placeholder="テナント名で検索"
            className="input-field flex-1 min-w-[240px]"
          />
          <button onClick={searchTenants} disabled={searching} className="btn-secondary text-sm">
            検索
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-3 space-y-2">
            <Field label="認定メモ (任意)">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field w-full"
                placeholder="例: 紹介経由 / 契約書 #123"
              />
            </Field>
            <ul className="divide-y divide-border-subtle">
              {results.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span className="text-sm">{t.name}</span>
                  <button onClick={() => grant(t.id)} disabled={busyId === t.id} className="btn-primary text-xs">
                    認定する
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-secondary">
          <input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} />
          解除済みも表示
        </label>
      </div>

      {msg && <div className="text-sm text-secondary">{msg}</div>}

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : certs.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface p-4 text-sm text-secondary">
          認定施工店はまだ登録されていません。
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface">
          {certs.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-primary">
                  {c.tenants?.name ?? "(削除済テナント)"}{" "}
                  <span className="ml-2 text-xs text-secondary">
                    {MANUFACTURER_CERTIFICATION_STATUS_LABELS[c.status]}
                  </span>
                </div>
                <div className="text-xs text-secondary">
                  認定: {new Date(c.certified_at).toLocaleDateString("ja-JP")}
                  {c.revoked_at && ` / 解除: ${new Date(c.revoked_at).toLocaleDateString("ja-JP")}`}
                </div>
                {c.notes && <div className="text-xs text-secondary">メモ: {c.notes}</div>}
              </div>
              {c.status === "active" && (
                <button onClick={() => revoke(c.id)} disabled={busyId === c.id} className="btn-secondary text-xs">
                  解除
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Members tab — manufacturer portal accounts
// ---------------------------------------------------------------------------

type ManufacturerMemberEntry = {
  id: string;
  user_id: string;
  role: "admin" | "viewer";
  display_name: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function MembersTab({ manufacturer }: { manufacturer: ManufacturerRow }) {
  const [members, setMembers] = useState<ManufacturerMemberEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "viewer">("viewer");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/platform/manufacturers/members?manufacturer_id=${manufacturer.id}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setMembers(json.members ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturer.id]);

  const invite = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manufacturer_id: manufacturer.id,
          email: email.trim(),
          display_name: displayName.trim() || undefined,
          role,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "招待に失敗しました。");
      setEmail("");
      setDisplayName("");
      setRole("viewer");
      setMsg("招待メールを送信しました。");
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "招待に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (m: ManufacturerMemberEntry) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/manufacturers/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "更新に失敗しました。");
      reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "更新に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border-subtle bg-surface-hover p-3">
        <div className="text-sm font-medium text-primary mb-2">担当者を招待する</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="input-field"
            type="email"
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="表示名 (任意)"
            className="input-field"
          />
          <select value={role} onChange={(e) => setRole(e.target.value as "admin" | "viewer")} className="select-field">
            <option value="viewer">viewer (閲覧のみ)</option>
            <option value="admin">admin (将来の管理操作用)</option>
          </select>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-secondary">
            指定アドレスに Supabase
            の招待メールが届きます。リンクからパスワード設定後、メーカーポータルにログインできます。
          </p>
          <button onClick={invite} disabled={busy || !email.trim()} className="btn-primary text-xs">
            招待を送信
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-secondary">{msg}</div>}

      {loading ? (
        <div className="text-sm text-secondary">読み込み中...</div>
      ) : members.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface p-4 text-sm text-secondary">
          メンバーはまだ登録されていません。
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-surface">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-primary">
                  {m.display_name ?? m.email ?? "(名称未設定)"}
                  <span className="ml-2 text-xs text-secondary">role: {m.role}</span>
                  {!m.is_active && (
                    <span className="ml-2 rounded-full bg-surface-hover px-2 py-0.5 text-xs text-secondary">無効</span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {m.email ?? "メール不明"}
                  {" · "}
                  追加: {new Date(m.created_at).toLocaleDateString("ja-JP")}
                </div>
              </div>
              <button onClick={() => toggleActive(m)} disabled={busy} className="btn-secondary text-xs">
                {m.is_active ? "無効化" : "再有効化"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset uploader (manufacturer logo / template thumbnail)
// ---------------------------------------------------------------------------

function AssetUploader({
  label,
  kind,
  manufacturerId,
  templateId,
  onUploaded,
}: {
  label: string;
  kind: "manufacturer_logo" | "manufacturer_template_thumbnail";
  manufacturerId: string;
  templateId?: string;
  onUploaded: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      form.append("manufacturer_id", manufacturerId);
      if (templateId) form.append("template_id", templateId);

      const res = await fetch("/api/admin/platform/manufacturers/upload", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "アップロードに失敗しました。");
      const path = String(json.path ?? "");
      if (!path) throw new Error("アップロードレスポンスにパスがありません。");
      onUploaded(path);
      setOkMsg("アップロード完了。保存ボタンで反映してください。");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "アップロードに失敗しました。");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-1">
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-secondary">
        <input type="file" accept="image/png" onChange={handleChange} disabled={busy} className="text-xs" />
        <span>{busy ? "アップロード中..." : label}</span>
      </label>
      <p className="text-[11px] text-muted">PNG / 2MB以下</p>
      {err && <p className="text-xs text-danger-text">{err}</p>}
      {okMsg && <p className="text-xs text-success-text">{okMsg}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-secondary">{label}</span>
      {children}
    </label>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full overflow-auto rounded-2xl bg-surface p-5 shadow-xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <button onClick={onClose} className="text-2xl leading-none text-secondary hover:text-primary">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
