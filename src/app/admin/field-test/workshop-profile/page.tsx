"use client";

import { useEffect, useState, useCallback } from "react";
import { WORKSHOP_CAPABILITY_LABELS } from "@/types/manufacturer";

type Profile = {
  id?: string;
  permits: { type: string; number?: string; expires_at?: string }[];
  mechanic_certifications: { grade: string; holder_name?: string; cert_number?: string }[];
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
  service_area: { prefectures?: string[]; radius_km?: number; notes?: string };
  verified_at: string | null;
};

const EQUIPMENT_KEYS = ["has_lift", "has_diagnostic_tools", "has_adas_equipment"] as const;
const CAPABILITY_KEYS = ["ev_capable", "body_work", "painting", "coating", "ppf", "electrical", "mobile_service"] as const;

const EMPTY_PROFILE: Profile = {
  permits: [], mechanic_certifications: [],
  has_lift: false, has_diagnostic_tools: false, has_adas_equipment: false, equipment_notes: null,
  ev_capable: false, body_work: false, painting: false, coating: false, ppf: false, electrical: false, mobile_service: false,
  supported_vehicles: [], service_area: {},
  verified_at: null,
};

export default function WorkshopProfilePage() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/field-test/workshop-profile", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => { if (json.profile) setProfile(json.profile); })
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (key: string) => {
    setProfile((prev) => ({ ...prev, [key]: !prev[key as keyof Profile] }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/field-test/workshop-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        const json = await res.json();
        setProfile(json.profile);
        alert("保存しました");
      } else {
        const err = await res.json();
        alert(err.message ?? err.error ?? "保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  }, [profile]);

  if (loading) {
    return <div className="p-6 text-sm text-secondary">読み込み中...</div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-primary">工場設備プロフィール</h1>
        {profile.verified_at && (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
            認証済 ({profile.verified_at.slice(0, 10)})
          </span>
        )}
      </div>

      {/* Equipment */}
      <Section title="設備">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EQUIPMENT_KEYS.map((k) => (
            <ToggleChip key={k} label={WORKSHOP_CAPABILITY_LABELS[k]} active={!!profile[k]} onClick={() => handleToggle(k)} />
          ))}
        </div>
        <div className="mt-3">
          <label className="text-xs text-secondary">設備メモ</label>
          <textarea
            className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
            rows={2}
            value={profile.equipment_notes ?? ""}
            onChange={(e) => setProfile((p) => ({ ...p, equipment_notes: e.target.value || null }))}
          />
        </div>
      </Section>

      {/* Capabilities */}
      <Section title="対応サービス">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CAPABILITY_KEYS.map((k) => (
            <ToggleChip key={k} label={WORKSHOP_CAPABILITY_LABELS[k]} active={!!profile[k]} onClick={() => handleToggle(k)} />
          ))}
        </div>
      </Section>

      {/* Supported Vehicles */}
      <Section title="対応車種">
        <textarea
          className="w-full rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
          rows={2}
          placeholder="トヨタ, 日産, ホンダ...（カンマ区切り）"
          value={(profile.supported_vehicles ?? []).join(", ")}
          onChange={(e) => setProfile((p) => ({ ...p, supported_vehicles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) }))}
        />
      </Section>

      {/* Service Area */}
      <Section title="対応エリア">
        <div className="space-y-2">
          <div>
            <label className="text-xs text-secondary">都道府県（カンマ区切り）</label>
            <input
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              placeholder="東京都, 神奈川県..."
              value={(profile.service_area?.prefectures ?? []).join(", ")}
              onChange={(e) => setProfile((p) => ({
                ...p,
                service_area: { ...p.service_area, prefectures: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) },
              }))}
            />
          </div>
          <div>
            <label className="text-xs text-secondary">対応半径 (km)</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              value={profile.service_area?.radius_km ?? ""}
              onChange={(e) => setProfile((p) => ({
                ...p,
                service_area: { ...p.service_area, radius_km: e.target.value ? Number(e.target.value) : undefined },
              }))}
            />
          </div>
          <div>
            <label className="text-xs text-secondary">エリア補足</label>
            <input
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              value={profile.service_area?.notes ?? ""}
              onChange={(e) => setProfile((p) => ({
                ...p,
                service_area: { ...p.service_area, notes: e.target.value || undefined },
              }))}
            />
          </div>
        </div>
      </Section>

      {/* Permits */}
      <Section title="認証・許可">
        {profile.permits.map((p, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input
              className="flex-1 rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              placeholder="種別"
              value={p.type}
              onChange={(e) => {
                const arr = [...profile.permits];
                arr[i] = { ...arr[i], type: e.target.value };
                setProfile((prev) => ({ ...prev, permits: arr }));
              }}
            />
            <input
              className="w-32 rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              placeholder="番号"
              value={p.number ?? ""}
              onChange={(e) => {
                const arr = [...profile.permits];
                arr[i] = { ...arr[i], number: e.target.value || undefined };
                setProfile((prev) => ({ ...prev, permits: arr }));
              }}
            />
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => setProfile((prev) => ({ ...prev, permits: prev.permits.filter((_, j) => j !== i) }))}
            >
              削除
            </button>
          </div>
        ))}
        <button
          className="text-xs text-accent hover:underline"
          onClick={() => setProfile((prev) => ({ ...prev, permits: [...prev.permits, { type: "" }] }))}
        >
          + 追加
        </button>
      </Section>

      {/* Mechanic Certifications */}
      <Section title="整備士資格">
        {profile.mechanic_certifications.map((c, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <input
              className="flex-1 rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              placeholder="等級"
              value={c.grade}
              onChange={(e) => {
                const arr = [...profile.mechanic_certifications];
                arr[i] = { ...arr[i], grade: e.target.value };
                setProfile((prev) => ({ ...prev, mechanic_certifications: arr }));
              }}
            />
            <input
              className="w-28 rounded-lg border border-border-subtle bg-surface p-2 text-sm text-primary"
              placeholder="氏名"
              value={c.holder_name ?? ""}
              onChange={(e) => {
                const arr = [...profile.mechanic_certifications];
                arr[i] = { ...arr[i], holder_name: e.target.value || undefined };
                setProfile((prev) => ({ ...prev, mechanic_certifications: arr }));
              }}
            />
            <button
              className="text-xs text-red-500 hover:underline"
              onClick={() => setProfile((prev) => ({ ...prev, mechanic_certifications: prev.mechanic_certifications.filter((_, j) => j !== i) }))}
            >
              削除
            </button>
          </div>
        ))}
        <button
          className="text-xs text-accent hover:underline"
          onClick={() => setProfile((prev) => ({ ...prev, mechanic_certifications: [...prev.mechanic_certifications, { grade: "" }] }))}
        >
          + 追加
        </button>
      </Section>

      {/* Save */}
      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-primary mb-3">{title}</h2>
      {children}
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border-subtle bg-surface text-muted hover:bg-surface-hover"
      }`}
    >
      {active ? "✓ " : ""}{label}
    </button>
  );
}
