"use client";

import { useEffect, useState, useCallback } from "react";
import { WORKSHOP_CAPABILITY_LABELS } from "@/types/manufacturer";

type Permit = { type: string; number?: string; expires_at?: string };
type Cert = { grade: string; holder_name?: string; cert_number?: string };
type ServiceArea = { prefectures?: string[]; radius_km?: number; notes?: string };

type Profile = {
  id: string;
  tenant_id: string;
  permits: Permit[];
  mechanic_certifications: Cert[];
  has_lift: boolean;
  has_diagnostic_tools: boolean;
  has_adas_equipment: boolean;
  equipment_notes: string | null;
  ev_capable: boolean;
  body_work: boolean;
  painting: boolean;
  coating: boolean;
  ppf: boolean;
  electrical: boolean;
  mobile_service: boolean;
  supported_vehicles: string[];
  service_area: ServiceArea;
  verified_at: string | null;
};

const BOOL_KEYS = [
  "has_lift",
  "has_diagnostic_tools",
  "has_adas_equipment",
  "ev_capable",
  "body_work",
  "painting",
  "coating",
  "ppf",
  "electrical",
  "mobile_service",
] as const;

type BoolKey = (typeof BOOL_KEYS)[number];

export default function WorkshopProfilesTab({
  projectId,
  isAdmin,
}: {
  projectId: string;
  isAdmin: boolean;
}) {
  const [profiles, setProfiles] = useState<(Profile & { tenant_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    // Fetch profiles for this project's participants
    fetch(`/api/manufacturer/field-test/workshop-profiles?project_id=${projectId}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((json) => setProfiles(json.profiles ?? []))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(load, [load]);

  if (loading) return <div className="text-sm text-secondary">読み込み中...</div>;

  if (profiles.length === 0) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface p-6 text-center text-sm text-secondary">
        参加施工店のプロファイルがありません。応募が承認された施工店のプロファイルがここに表示されます。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {profiles.map((p) => (
        <div key={p.id} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-primary">
                {p.tenant_name ?? p.tenant_id.slice(0, 8)}
              </h3>
              {p.verified_at && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                  検証済み
                </span>
              )}
            </div>
            {isAdmin && (
              <button
                onClick={() => setEditingId(editingId === p.tenant_id ? null : p.tenant_id)}
                className="text-xs text-accent hover:underline"
              >
                {editingId === p.tenant_id ? "閉じる" : "編集"}
              </button>
            )}
          </div>

          {editingId === p.tenant_id ? (
            <ProfileEditForm
              profile={p}
              onSaved={() => {
                setEditingId(null);
                load();
              }}
            />
          ) : (
            <ProfileView profile={p} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── View ─────────────────────────────────────────────── */

function ProfileView({ profile }: { profile: Profile }) {
  const active = BOOL_KEYS.filter((k) => profile[k]);

  return (
    <div className="space-y-3">
      {/* Capability tags */}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {active.map((k) => (
            <span key={k} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
              {WORKSHOP_CAPABILITY_LABELS[k]}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Permits */}
        {profile.permits.length > 0 && (
          <Section title="許認可">
            {profile.permits.map((p, i) => (
              <div key={i} className="text-xs text-secondary">
                {p.type}
                {p.number && <span className="text-muted ml-1">({p.number})</span>}
                {p.expires_at && (
                  <span className="text-muted ml-1">〜{new Date(p.expires_at).toLocaleDateString("ja-JP")}</span>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Mechanic certifications */}
        {profile.mechanic_certifications.length > 0 && (
          <Section title="整備士資格">
            {profile.mechanic_certifications.map((c, i) => (
              <div key={i} className="text-xs text-secondary">
                {c.grade}
                {c.holder_name && <span className="ml-1">({c.holder_name})</span>}
              </div>
            ))}
          </Section>
        )}

        {/* Supported vehicles */}
        {profile.supported_vehicles.length > 0 && (
          <Section title="対応車種">
            <div className="text-xs text-secondary">{profile.supported_vehicles.join("、")}</div>
          </Section>
        )}

        {/* Service area */}
        {(profile.service_area.prefectures?.length || profile.service_area.notes) && (
          <Section title="対応エリア">
            <div className="text-xs text-secondary">
              {profile.service_area.prefectures?.join("、")}
              {profile.service_area.radius_km != null && (
                <span className="ml-1">（半径 {profile.service_area.radius_km}km）</span>
              )}
            </div>
            {profile.service_area.notes && (
              <div className="text-xs text-muted mt-0.5">{profile.service_area.notes}</div>
            )}
          </Section>
        )}
      </div>

      {/* Equipment notes */}
      {profile.equipment_notes && (
        <Section title="設備メモ">
          <div className="text-xs text-secondary whitespace-pre-wrap">{profile.equipment_notes}</div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold text-muted mb-1">{title}</h4>
      {children}
    </div>
  );
}

/* ── Edit Form ────────────────────────────────────────── */

function ProfileEditForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);

  // Boolean capabilities
  const [bools, setBools] = useState<Record<BoolKey, boolean>>(
    Object.fromEntries(BOOL_KEYS.map((k) => [k, profile[k]])) as Record<BoolKey, boolean>,
  );

  // Text fields
  const [equipmentNotes, setEquipmentNotes] = useState(profile.equipment_notes ?? "");
  const [vehiclesText, setVehiclesText] = useState(profile.supported_vehicles.join("、"));
  const [prefecturesText, setPrefecturesText] = useState(
    profile.service_area.prefectures?.join("、") ?? "",
  );
  const [radiusKm, setRadiusKm] = useState(profile.service_area.radius_km?.toString() ?? "");
  const [areaNotes, setAreaNotes] = useState(profile.service_area.notes ?? "");

  // Permits
  const [permits, setPermits] = useState<Permit[]>(
    profile.permits.length > 0 ? [...profile.permits] : [],
  );

  // Certifications
  const [certs, setCerts] = useState<Cert[]>(
    profile.mechanic_certifications.length > 0 ? [...profile.mechanic_certifications] : [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const splitJa = (s: string) =>
      s
        .split(/[、,]/)
        .map((v) => v.trim())
        .filter(Boolean);

    const body = {
      ...bools,
      equipment_notes: equipmentNotes || null,
      supported_vehicles: splitJa(vehiclesText),
      service_area: {
        prefectures: splitJa(prefecturesText),
        ...(radiusKm ? { radius_km: Number(radiusKm) } : {}),
        ...(areaNotes ? { notes: areaNotes } : {}),
      },
      permits: permits.filter((p) => p.type),
      mechanic_certifications: certs.filter((c) => c.grade),
    };

    await fetch(`/api/manufacturer/field-test/workshop-profiles/${profile.tenant_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Boolean capabilities */}
      <fieldset>
        <legend className="text-[11px] font-semibold text-muted mb-2">対応サービス・設備</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
          {BOOL_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-xs text-primary cursor-pointer">
              <input
                type="checkbox"
                checked={bools[k]}
                onChange={(e) => setBools({ ...bools, [k]: e.target.checked })}
                className="rounded border-border-subtle"
              />
              {WORKSHOP_CAPABILITY_LABELS[k]}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Permits */}
      <fieldset>
        <legend className="text-[11px] font-semibold text-muted mb-2">許認可</legend>
        <div className="space-y-1.5">
          {permits.map((p, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input
                placeholder="種別（認証工場 等）"
                value={p.type}
                onChange={(e) => {
                  const next = [...permits];
                  next[i] = { ...next[i], type: e.target.value };
                  setPermits(next);
                }}
                className="flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs"
              />
              <input
                placeholder="番号"
                value={p.number ?? ""}
                onChange={(e) => {
                  const next = [...permits];
                  next[i] = { ...next[i], number: e.target.value || undefined };
                  setPermits(next);
                }}
                className="w-28 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs"
              />
              <input
                type="date"
                value={p.expires_at?.slice(0, 10) ?? ""}
                onChange={(e) => {
                  const next = [...permits];
                  next[i] = { ...next[i], expires_at: e.target.value || undefined };
                  setPermits(next);
                }}
                className="w-32 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => setPermits(permits.filter((_, j) => j !== i))}
                className="text-xs text-red-500 hover:text-red-700"
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPermits([...permits, { type: "" }])}
            className="text-xs text-accent hover:underline"
          >
            + 許認可を追加
          </button>
        </div>
      </fieldset>

      {/* Mechanic certifications */}
      <fieldset>
        <legend className="text-[11px] font-semibold text-muted mb-2">整備士資格</legend>
        <div className="space-y-1.5">
          {certs.map((c, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input
                placeholder="資格名（2級ガソリン 等）"
                value={c.grade}
                onChange={(e) => {
                  const next = [...certs];
                  next[i] = { ...next[i], grade: e.target.value };
                  setCerts(next);
                }}
                className="flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs"
              />
              <input
                placeholder="保有者名"
                value={c.holder_name ?? ""}
                onChange={(e) => {
                  const next = [...certs];
                  next[i] = { ...next[i], holder_name: e.target.value || undefined };
                  setCerts(next);
                }}
                className="w-28 rounded-lg border border-border-subtle bg-surface px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => setCerts(certs.filter((_, j) => j !== i))}
                className="text-xs text-red-500 hover:text-red-700"
              >
                削除
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCerts([...certs, { grade: "" }])}
            className="text-xs text-accent hover:underline"
          >
            + 資格を追加
          </button>
        </div>
      </fieldset>

      {/* Supported vehicles */}
      <div>
        <label className="text-[11px] font-semibold text-muted mb-1 block">対応車種（読点区切り）</label>
        <input
          value={vehiclesText}
          onChange={(e) => setVehiclesText(e.target.value)}
          placeholder="国産全般、輸入車、大型"
          className="w-full rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
        />
      </div>

      {/* Service area */}
      <fieldset>
        <legend className="text-[11px] font-semibold text-muted mb-2">対応エリア</legend>
        <div className="space-y-1.5">
          <input
            value={prefecturesText}
            onChange={(e) => setPrefecturesText(e.target.value)}
            placeholder="都道府県（読点区切り）: 東京都、神奈川県"
            className="w-full rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            <div className="flex items-center gap-1">
              <label className="text-xs text-muted">半径</label>
              <input
                type="number"
                min="0"
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                placeholder="km"
                className="w-20 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
              />
              <span className="text-xs text-muted">km</span>
            </div>
            <input
              value={areaNotes}
              onChange={(e) => setAreaNotes(e.target.value)}
              placeholder="補足（首都圏全域 等）"
              className="flex-1 rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
            />
          </div>
        </div>
      </fieldset>

      {/* Equipment notes */}
      <div>
        <label className="text-[11px] font-semibold text-muted mb-1 block">設備メモ</label>
        <textarea
          value={equipmentNotes}
          onChange={(e) => setEquipmentNotes(e.target.value)}
          placeholder="保有設備の補足情報"
          rows={2}
          className="w-full rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-xs"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {saving ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
