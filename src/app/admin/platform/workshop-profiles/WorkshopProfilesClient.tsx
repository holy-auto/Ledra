"use client";

import { useEffect, useState } from "react";
import { WORKSHOP_CAPABILITY_LABELS } from "@/types/manufacturer";

type Permit = { type: string; number?: string; expires_at?: string };
type Cert = { grade: string; holder_name?: string };

interface ProfileRow {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  permits: Permit[];
  mechanic_certifications: Cert[];
  supported_vehicles: string[];
  service_area: { prefectures?: string[]; radius_km?: number; notes?: string };
  verified_at: string | null;
  updated_at: string;
  [key: string]: unknown;
}

const CAPABILITY_KEYS = Object.keys(WORKSHOP_CAPABILITY_LABELS);

const fmt = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

export default function WorkshopProfilesClient() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // 初回ロード（set-state は async コールバック内のみ = effect 内の同期 setState を避ける）
  useEffect(() => {
    let active = true;
    fetch("/api/admin/platform/workshop-profiles", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (json?.ok) setProfiles(json.profiles ?? []);
        else setMsg(json?.message ?? "読み込みに失敗しました。");
      })
      .catch(() => active && setMsg("読み込みに失敗しました。"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const toggleVerified = async (p: ProfileRow) => {
    const verified = !p.verified_at;
    setBusyId(p.tenant_id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/platform/workshop-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: p.tenant_id, verified }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setProfiles((prev) =>
          prev.map((x) => (x.tenant_id === p.tenant_id ? { ...x, verified_at: json.verified_at } : x)),
        );
        setMsg(`${p.tenant_name ?? "施工店"} を${verified ? "検証済みにしました" : "未検証に戻しました"}。`);
      } else {
        setMsg(json?.message ?? "更新に失敗しました。");
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
        <div
          role="status"
          className="rounded-md border border-info-border bg-info-dim px-3 py-2 text-sm text-info-text"
        >
          {msg}
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="text-sm text-secondary">
          設備・資格を登録した施工店はまだありません。施工店が実証テストの「工場設備プロフィール」を保存すると、ここに表示されます。
        </p>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => {
            const capabilities = CAPABILITY_KEYS.filter((k) => p[k] === true);
            return (
              <div key={p.tenant_id} className="rounded-lg border border-default p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-primary">{p.tenant_name ?? p.tenant_id}</div>
                    <div className="text-xs text-secondary">最終更新 {fmt(p.updated_at)}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {p.verified_at ? (
                      <span className="inline-flex items-center rounded-full bg-success-dim px-2 py-0.5 text-xs font-medium text-success-text">
                        検証済み（{fmt(p.verified_at)}）
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-subtle px-2 py-0.5 text-xs text-secondary">
                        未検証
                      </span>
                    )}
                    <button
                      onClick={() => toggleVerified(p)}
                      disabled={busyId === p.tenant_id}
                      className={p.verified_at ? "btn-secondary text-sm" : "btn-primary text-sm"}
                    >
                      {busyId === p.tenant_id ? "更新中…" : p.verified_at ? "検証済みを外す" : "検証済みにする"}
                    </button>
                  </div>
                </div>

                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold text-secondary">許認可</dt>
                    <dd>
                      {p.permits.length === 0
                        ? "—"
                        : p.permits.map((x, i) => (
                            <div key={i}>
                              {x.type}
                              {x.number && <span className="ml-1 text-secondary">（{x.number}）</span>}
                              {x.expires_at && <span className="ml-1 text-secondary">〜{x.expires_at}</span>}
                            </div>
                          ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-secondary">整備士資格</dt>
                    <dd>
                      {p.mechanic_certifications.length === 0
                        ? "—"
                        : p.mechanic_certifications.map((c, i) => (
                            <div key={i}>
                              {c.grade}
                              {c.holder_name && <span className="ml-1 text-secondary">（{c.holder_name}）</span>}
                            </div>
                          ))}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-secondary">設備・対応サービス</dt>
                    <dd>
                      {capabilities.length === 0
                        ? "—"
                        : capabilities.map((k) => WORKSHOP_CAPABILITY_LABELS[k]).join("、")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-secondary">対応車種・エリア</dt>
                    <dd>
                      {p.supported_vehicles.length > 0 ? p.supported_vehicles.join("、") : "—"}
                      {p.service_area.prefectures?.length ? (
                        <div className="text-secondary">{p.service_area.prefectures.join("、")}</div>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-secondary">
        ※
        検証済みは、許可番号・資格者などを書類や現地で確かめてから付けてください。施工店が中身を書き換えて保存すると、自動で未検証に戻ります。
      </p>
    </div>
  );
}
