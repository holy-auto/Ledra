"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/format";
import Link from "next/link";

type Field = {
  key: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: string[];
};

type Section = {
  title?: string;
  fields?: Field[];
};

function pickValues(obj: any): Record<string, any> {
  return obj?.values ?? obj?.data ?? obj?.preset_values ?? obj?.content ?? obj?.field_values ?? {};
}

function renderValue(field: Field, raw: any) {
  if (raw === null || raw === undefined) return "";
  if (field.type === "checkbox") return raw ? "はい" : "いいえ";
  if (field.type === "multiselect") {
    if (Array.isArray(raw)) return raw.filter(Boolean).join(", ");
    return String(raw);
  }
  if (field.type === "date") {
    const formatted = formatDate(String(raw));
    return formatted === "-" ? String(raw) : formatted;
  }
  if (field.type === "number") {
    if (typeof raw === "number") return raw.toLocaleString("ja-JP");
    return String(raw);
  }
  return String(raw);
}

export default function InsurerCertificatePage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams<{ public_id: string }>();
  const publicId = typeof params?.public_id === "string" ? params.public_id : "";

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cert, setCert] = useState<any>(null);
  const [disclosureStatus, setDisclosureStatus] = useState<{
    disclosed: boolean;
    insurer_requested: boolean;
    tenant_consented: boolean;
  } | null>(null);
  const [disclosureBusy, setDisclosureBusy] = useState(false);
  const [relatedCases, setRelatedCases] = useState<Array<{id: string; case_number: string; title: string; status: string}>>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { window.location.href = "/insurer/login"; return; }
      setReady(true);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!ready || !publicId) return;
    (async () => {
      setErr(null);
      setCert(null);
      try {
        const res = await fetch(`/api/insurer/certificate?pid=${encodeURIComponent(publicId)}`, { cache: "no-store" });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? j?.message ?? "load_failed");
        const c = j?.certificate ?? null;
        setCert(c);
        if (c) {
          setDisclosureStatus({
            disclosed: !!c.pii_disclosed,
            insurer_requested: !!c.pii_disclosed,
            tenant_consented: !!c.pii_disclosed,
          });
          // Fetch related cases
          try {
            const casesRes = await fetch(`/api/insurer/cases?certificate_id=${c.id}`);
            if (casesRes.ok) {
              const casesJson = await casesRes.json();
              setRelatedCases(Array.isArray(casesJson) ? casesJson : casesJson?.cases ?? []);
            }
          } catch {}
          // Also fetch detailed disclosure status
          try {
            const dRes = await fetch(`/api/insurer/pii-disclosure?certificate_id=${c.id}`);
            if (dRes.ok) {
              const dj = await dRes.json();
              setDisclosureStatus({
                disclosed: !!dj.disclosed,
                insurer_requested: !!dj.insurer_requested,
                tenant_consented: !!dj.tenant_consented,
              });
            }
          } catch {}
        }
      } catch (e: any) {
        setErr(e?.message ?? "load_failed");
      }
    })();
  }, [ready, publicId]);

  const requestDisclosure = async () => {
    if (!cert) return;
    setDisclosureBusy(true);
    try {
      const res = await fetch("/api/insurer/pii-disclosure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          certificate_id: cert.id,
          reason: "保険事故照会のため個人情報の開示を申請します",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "request_failed");
      }
      setDisclosureStatus(prev => prev ? { ...prev, insurer_requested: true } : prev);
    } catch (e: any) {
      setErr(e?.message ?? "request_failed");
    } finally {
      setDisclosureBusy(false);
    }
  };

  if (!ready) return null;

  const csvOneUrl = publicId ? `/api/insurer/export-one?pid=${encodeURIComponent(publicId)}` : "#";
  const pdfOneUrl = publicId ? `/api/insurer/pdf-one?pid=${encodeURIComponent(publicId)}` : "#";

  const vehicleModel = cert?.vehicle_model ?? cert?.vehicle_info_json?.model ?? "";
  const vehiclePlate = cert?.vehicle_plate ?? cert?.vehicle_info_json?.plate ?? "";
  const vehicleVin = cert?.vehicle_vin ?? "";

  const snapshot = cert?.content_preset_json?.schema_snapshot ?? {};
  const sections: Section[] = Array.isArray(snapshot?.sections) ? snapshot.sections : [];
  const values = pickValues(cert?.content_preset_json);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Link href="/insurer/search" className="text-sm text-neutral-500 hover:text-neutral-700">
            ← 検索へ戻る
          </Link>
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            CERTIFICATE DETAIL
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">証明書詳細</h1>
          <div className="text-sm text-neutral-500">
            public_id: <span className="font-mono font-bold text-neutral-700">{publicId}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {cert && (
            <Link
              href={`/insurer/cases?create=true&certificate_id=${cert.id}`}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              案件作成
            </Link>
          )}
          <a href={pdfOneUrl} className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            PDF
          </a>
          <a href={csvOneUrl} className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
            CSV
          </a>
        </div>
      </header>

      {!publicId && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">public_id が取得できません</div>}
      {err && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>}

      {cert && (
        <>
          {/* PII Disclosure Banner */}
          {disclosureStatus && !disclosureStatus.disclosed && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800 text-xs font-bold">!</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-amber-800">個人情報マスキング中</div>
                  <p className="mt-1 text-sm text-amber-700">
                    顧客名などの個人情報は保護されています。保険事故の照会など正当な理由がある場合、
                    施工店との双方同意により個人情報を開示できます。
                  </p>
                  <div className="mt-3 flex items-center gap-4">
                    {!disclosureStatus.insurer_requested ? (
                      <button
                        onClick={requestDisclosure}
                        disabled={disclosureBusy}
                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {disclosureBusy ? "申請中..." : "個人情報開示を申請"}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 text-sm">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">保険会社側: 申請済み</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          disclosureStatus.tenant_consented
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-neutral-100 text-neutral-500"
                        }`}>
                          施工店側: {disclosureStatus.tenant_consented ? "承認済み" : "未承認"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {disclosureStatus?.disclosed && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <span>✓</span> 個人情報開示済み — 双方の同意により顧客情報が表示されています
              </div>
            </section>
          )}

          {/* Summary */}
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 mb-4">SUMMARY</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-xs font-medium text-neutral-500">ステータス</div>
                <div className={`mt-1 text-sm font-bold ${cert.status === "void" ? "text-red-600" : "text-emerald-600"}`}>
                  {cert.status === "active" ? "有効" : cert.status === "void" ? "無効" : cert.status}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500">顧客名</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">{cert.customer_name ?? "-"}</div>
              </div>
              {(vehicleModel || vehiclePlate) && (
                <div>
                  <div className="text-xs font-medium text-neutral-500">車両</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-900">
                    {[vehicleModel, vehiclePlate].filter(Boolean).join(" / ")}
                  </div>
                </div>
              )}
              {vehicleVin && (
                <div>
                  <div className="text-xs font-medium text-neutral-500">車台番号</div>
                  <div className="mt-1 text-sm font-mono font-semibold text-neutral-900">{vehicleVin}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-neutral-500">施工種別</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">{cert.service_type ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500">有効期限</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">
                  {[cert.expiry_type, cert.expiry_value].filter(Boolean).join(" / ") || "-"}
                </div>
              </div>
              {cert.warranty_period_end && (
                <div>
                  <div className="text-xs font-medium text-neutral-500">保証期限</div>
                  <div className="mt-1 text-sm font-semibold text-neutral-900">{formatDate(cert.warranty_period_end)}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-neutral-500">施工店</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">{cert.tenant_name ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-neutral-500">作成日</div>
                <div className="mt-1 text-sm text-neutral-600">{formatDateTime(cert.created_at)}</div>
              </div>
            </div>

            {/* Vehicle link */}
            {cert.vehicle_id && (
              <div className="mt-4 border-t border-neutral-100 pt-4">
                <Link
                  href={`/insurer/vehicles/${cert.vehicle_id}`}
                  className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                >
                  この車両の全証明書を見る →
                </Link>
              </div>
            )}
          </section>

          {/* Template fields */}
          {sections.length > 0 && (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 mb-4">施工内容</div>
              {sections.map((sec, i) => (
                <div key={i} className={i > 0 ? "mt-6 border-t border-neutral-100 pt-6" : ""}>
                  <div className="text-sm font-bold text-neutral-800 mb-3">
                    {sec.title ?? `セクション${i + 1}`}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(sec.fields ?? []).map((f) => {
                      const label = f.label ?? f.key;
                      const raw = values?.[f.key];
                      const val = renderValue(f, raw);
                      if (val === "") return null;
                      return (
                        <div key={f.key}>
                          <div className="text-xs font-medium text-neutral-500">
                            {label} <span className="text-neutral-400">({f.type})</span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-neutral-900 whitespace-pre-wrap">{val}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Free text */}
          {cert.content_free_text && (
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500 mb-4">施工内容（自由記述）</div>
              <div className="text-sm text-neutral-700 whitespace-pre-wrap">{cert.content_free_text}</div>
            </section>
          )}

          {/* Related cases */}
          {relatedCases.length > 0 && (
            <section className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-3">
              <h2 className="text-lg font-bold text-neutral-900">関連案件 ({relatedCases.length})</h2>
              <div className="space-y-2">
                {relatedCases.map((c) => (
                  <Link key={c.id} href={`/insurer/cases/${c.id}`} className="flex items-center justify-between rounded-xl border border-neutral-100 px-4 py-3 hover:bg-neutral-50">
                    <div>
                      <span className="font-mono text-xs text-neutral-500">{c.case_number}</span>
                      <span className="ml-2 text-sm font-medium text-neutral-900">{c.title}</span>
                    </div>
                    <span className="text-xs text-blue-600">詳細 →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
