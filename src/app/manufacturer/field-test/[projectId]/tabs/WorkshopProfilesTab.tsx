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

// メーカーは閲覧のみ。設備・資格は1施工店1行で他社とも共有のため、登録・更新は施工店本人が行う
export default function WorkshopProfilesTab({ projectId }: { projectId: string }) {
  const [profiles, setProfiles] = useState<(Profile & { tenant_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

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
        参加施工店の設備・資格はまだ登録されていません。応募が承認された施工店が自分で登録すると、ここに表示されます。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">設備・資格は各施工店が登録・更新します。メーカーからは閲覧のみです。</p>
      {profiles.map((p) => (
        <div key={p.id} className="rounded-2xl border border-border-subtle bg-surface p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-primary">{p.tenant_name ?? p.tenant_id.slice(0, 8)}</h3>
            {p.verified_at && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                検証済み
              </span>
            )}
          </div>

          <ProfileView profile={p} />
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
