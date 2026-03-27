"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/format";
import Link from "next/link";

type Vehicle = {
  id: string;
  maker: string;
  model: string;
  year: number | null;
  plate_display: string;
  vin_code: string;
  size_class: string;
  tenant_name: string;
};

type CertRow = {
  certificate_id: string;
  public_id: string;
  status: string;
  customer_name: string;
  service_type: string;
  certificate_no: string;
  created_at: string;
};

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold text-neutral-900 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

export default function InsurerVehicleDetailPage() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams<{ id: string }>();
  const vehicleId = params?.id ?? "";

  const [ready, setReady] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [relatedCases, setRelatedCases] = useState<Array<{id: string; case_number: string; title: string; status: string}>>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/insurer/login";
        return;
      }
      setReady(true);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!ready || !vehicleId) return;
    (async () => {
      try {
        const res = await fetch(`/api/insurer/vehicles/${vehicleId}`, {
          cache: "no-store",
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "load_failed");
        setVehicle(j.vehicle);
        setCerts(j.certificates ?? []);
        // Fetch related cases
        try {
          const casesRes = await fetch(`/api/insurer/cases?vehicle_id=${vehicleId}`);
          if (casesRes.ok) {
            const casesJson = await casesRes.json();
            setRelatedCases(Array.isArray(casesJson) ? casesJson : casesJson?.cases ?? []);
          }
        } catch {}
      } catch (e: any) {
        setErr(e?.message ?? "load_failed");
      }
    })();
  }, [ready, vehicleId]);

  if (!ready) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/insurer/vehicles"
              className="text-sm text-neutral-500 hover:text-neutral-700"
            >
              &larr; 車両検索へ
            </Link>
          </div>
          {vehicleId && (
            <Link
              href={`/insurer/cases?create=true&vehicle_id=${vehicleId}`}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              案件作成
            </Link>
          )}
        </div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          VEHICLE DETAIL
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          車両詳細
        </h1>
      </header>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {err}
        </div>
      )}

      {vehicle && (
        <>
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-xs font-semibold tracking-[0.18em] text-neutral-500">
              VEHICLE INFO
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label="車台番号" value={vehicle.vin_code || "-"} mono />
              <InfoItem label="メーカー" value={vehicle.maker || "-"} />
              <InfoItem label="車種" value={vehicle.model || "-"} />
              <InfoItem
                label="年式"
                value={vehicle.year?.toString() ?? "-"}
              />
              <InfoItem
                label="ナンバー"
                value={vehicle.plate_display || "-"}
              />
              <InfoItem label="サイズ" value={vehicle.size_class || "-"} />
              <InfoItem label="施工店" value={vehicle.tenant_name || "-"} />
            </div>
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">
                  CERTIFICATES
                </div>
                <div className="mt-1 text-base font-semibold text-neutral-900">
                  証明書履歴
                </div>
              </div>
              <div className="text-sm text-neutral-500">
                <span className="font-semibold text-neutral-900">
                  {certs.length}
                </span>{" "}
                件
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      証明書ID
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      ステータス
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      顧客名
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      施工種別
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      証明書番号
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      作成日時
                    </th>
                    <th className="p-3 text-left font-semibold text-neutral-600">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {certs.map((c) => (
                    <tr
                      key={c.certificate_id}
                      className="border-t hover:bg-neutral-50"
                    >
                      <td className="p-3 font-mono text-xs text-neutral-700">
                        {c.public_id}
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            c.status === "void"
                              ? "font-medium text-red-600"
                              : "font-medium text-emerald-600"
                          }
                        >
                          {c.status === "active" ? "有効" : "無効"}
                        </span>
                      </td>
                      <td className="p-3 text-neutral-600">
                        {c.customer_name}
                      </td>
                      <td className="p-3 text-neutral-600">
                        {c.service_type || "-"}
                      </td>
                      <td className="p-3 text-neutral-600">
                        {c.certificate_no || "-"}
                      </td>
                      <td className="p-3 whitespace-nowrap text-neutral-600">
                        {formatDateTime(c.created_at)}
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/insurer/c/${encodeURIComponent(c.public_id)}`}
                          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {certs.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-8 text-center text-sm text-neutral-500"
                      >
                        この車両に関連する証明書がありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

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
