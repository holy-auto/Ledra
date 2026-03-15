"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";

type Row = {
  public_id: string;
  customer_name: string;
  vehicle_info_json: any;
  created_at: string;
  status: string;
};

type HistoryItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  performed_at: string;
};

type Reservation = {
  id: string;
  date: string;
  time_slot: string | null;
  menu: string | null;
  status: string;
  note: string | null;
};

type Profile = {
  name: string;
  email: string | null;
  phone: string | null;
  certificateCount: number;
} | null;

type VehicleInfo = Record<string, any> | null;

function normalizeVehicleInfo(v: any): VehicleInfo {
  if (v == null) return null;

  // Supabaseから string で来るケースも吸収
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    try {
      const j = JSON.parse(s);
      if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, any>;
      return { value: j };
    } catch {
      return { value: s };
    }
  }

  if (typeof v === "object") {
    if (Array.isArray(v)) return { list: v };
    return v as Record<string, any>;
  }

  return { value: v };
}

function pick(obj: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}

function toText(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function buildVehicleSummary(info: VehicleInfo) {
  if (!info) return { title: "車両情報なし", lines: [] as string[], raw: null as any };

  const make = pick(info, ["maker", "make", "manufacturer", "brand", "メーカー", "メーカ", "車メーカー"]);
  const model = pick(info, ["model", "car_model", "vehicle_model", "name", "車種", "車名", "モデル"]);
  const grade = pick(info, ["grade", "trim", "グレード"]);
  const plate = pick(info, ["plate", "license_plate", "number_plate", "plate_no", "reg_no", "ナンバー", "登録番号"]);
  const color = pick(info, ["color", "カラー", "色"]);
  const year = pick(info, ["year", "model_year", "年式"]);
  const vin = pick(info, ["vin", "frame_no", "chassis_no", "車台番号"]);
  const mileage = pick(info, ["mileage", "odo", "走行距離"]);

  const parts: string[] = [];
  const mk = toText(make).trim();
  const md = toText(model).trim();
  const gr = toText(grade).trim();
  const head = [mk, md, gr].filter(Boolean).join(" / ");

  if (head) parts.push(head);
  if (plate) parts.push(`ナンバー: ${toText(plate)}`);
  if (year) parts.push(`年式: ${toText(year)}`);
  if (color) parts.push(`色: ${toText(color)}`);
  if (mileage) parts.push(`走行距離: ${toText(mileage)}`);
  if (vin) parts.push(`車台番号: ${toText(vin)}`);

  const title = head || "車両情報";
  const lines = parts.filter((x) => x && x.trim() !== "");

  return { title, lines, raw: info };
}

export default function CustomerListPage() {
  const router = useRouter();
  const params = useParams() as any;
  const tenant = useMemo(() => (params?.tenant ?? "").toString(), [params]);

  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [profile, setProfile] = useState<Profile>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"certs" | "history" | "reservations">("certs");

  async function load() {
    if (!tenant) return;

    setLoading(true);
    setErr(null);

    const res = await fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}`, {
      cache: "no-store",
      credentials: "include",
    });

    const j = await res.json().catch(() => ({} as any));

    if (!res.ok) {
      const e = j?.error ?? "unauthorized";
      setErr(e);
      setRows([]);
      setLoading(false);

      if (res.status === 401) {
        router.replace(`/customer/${tenant}/login`);
      }
      return;
    }

    const rows: Row[] = (j.rows ?? []) as Row[];
    rows.sort((a, b) => {
      const av = String(a.status ?? "").toLowerCase() === "void";
      const bv = String(b.status ?? "").toLowerCase() === "void";
      if (av !== bv) return av ? 1 : -1; // void を下へ
      const at = Date.parse(String(a.created_at ?? ""));
      const bt = Date.parse(String(b.created_at ?? ""));
      if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return bt - at; // 新しい順
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
    setRows(rows);
    setLoading(false);

    // Load additional data in background
    fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}&action=profile`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json()).then((j) => { if (j.profile) setProfile(j.profile); }).catch(() => {});
    fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}&action=history`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json()).then((j) => { if (j.history) setHistory(j.history); }).catch(() => {});
    fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}&action=reservations`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json()).then((j) => { if (j.reservations) setReservations(j.reservations); }).catch(() => {});
  }

  async function logout() {
    try {
      await fetch("/api/customer/logout", { method: "POST", credentials: "include" });
    } finally {
      router.replace(`/customer/${tenant}/login`);
    }
  }

  useEffect(() => {
    if (!tenant) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  return (
    <main className="mx-auto max-w-[900px] p-6 font-sans">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">
            {profile ? `${profile.name} 様` : "お客様マイページ"}
          </h1>
          <div className="mt-1 text-sm text-neutral-500">
            店舗: {tenant || "..."}
            {profile && (
              <span className="ml-3">証明書: {profile.certificateCount}件</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={!tenant || loading}
            className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm hover:bg-neutral-50 disabled:cursor-default disabled:opacity-60"
          >
            {loading ? "更新中…" : "更新"}
          </button>

          <button
            onClick={logout}
            className="cursor-pointer rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm hover:bg-neutral-50"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Profile card */}
      {profile && (profile.email || profile.phone) && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-sm">
          <div className="font-semibold text-neutral-700 mb-1">プロフィール</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-neutral-600">
            {profile.email && <div>メール: {profile.email}</div>}
            {profile.phone && <div>電話: {profile.phone}</div>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b border-neutral-200">
        {([
          { key: "certs" as const, label: "証明書", count: rows.length },
          { key: "history" as const, label: "施工履歴", count: history.length },
          { key: "reservations" as const, label: "予約", count: reservations.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}{t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
          {err}（ログインが必要） → <a href={`/customer/${tenant}/login`} className="underline">ログインへ</a>
        </div>
      ) : null}

      {/* History tab */}
      {tab === "history" && (
        <div className="mt-3 grid gap-2.5">
          {history.length === 0 ? (
            <div className="text-sm text-neutral-500">施工履歴がありません。</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-xl border border-neutral-200 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-neutral-800">{h.title ?? h.type}</div>
                  <div className="text-xs text-neutral-500">{formatDateTime(h.performed_at)}</div>
                </div>
                {h.description && (
                  <div className="mt-1 text-xs text-neutral-600">{h.description}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Reservations tab */}
      {tab === "reservations" && (
        <div className="mt-3 grid gap-2.5">
          {reservations.length === 0 ? (
            <div className="text-sm text-neutral-500">今後の予約はありません。</div>
          ) : (
            reservations.map((r) => (
              <div key={r.id} className="rounded-xl border border-neutral-200 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-neutral-800">
                    {r.date}{r.time_slot ? ` ${r.time_slot}` : ""}
                  </div>
                  <div className={`rounded-full border px-2 py-0.5 text-xs ${
                    r.status === "confirmed" ? "border-blue-200 bg-blue-50 text-blue-700" :
                    r.status === "in_progress" ? "border-amber-200 bg-amber-50 text-amber-700" :
                    "border-neutral-200 bg-neutral-50 text-neutral-600"
                  }`}>
                    {r.status}
                  </div>
                </div>
                {r.menu && <div className="mt-1 text-sm text-neutral-700">{r.menu}</div>}
                {r.note && <div className="mt-1 text-xs text-neutral-500">{r.note}</div>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Certificates tab */}
      <div className="mt-3 grid gap-2.5" style={{ display: tab === "certs" ? undefined : "none" }}>
        {rows.map((r) => {
          const rt = encodeURIComponent(`/customer/${tenant}`);
          const href = `/c/${r.public_id}?tenant=${encodeURIComponent(tenant)}&rt=${rt}&logout=1`;

          const vi = normalizeVehicleInfo(r.vehicle_info_json);
          const vs = buildVehicleSummary(vi);

          const isVoid = (r.status ?? "").toLowerCase() === "void";
          const statusLabel = isVoid ? "VOID（無効）" : (r.status ? String(r.status) : "active");

          return (
            <a key={r.public_id} href={href} className="no-underline text-inherit">
              <div
                className={`grid gap-2 rounded-xl border p-3.5 ${
                  isVoid ? "border-red-200 opacity-80" : "border-neutral-200"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <div className="text-xs text-neutral-500">{formatDateTime(r.created_at)}</div>
                  <div
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      isVoid
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-neutral-200 bg-green-50 text-green-800"
                    }`}
                  >
                    {statusLabel}
                  </div>
                </div>

                <div className="text-base font-semibold">{r.customer_name}</div>

                <div className="text-[13px] text-neutral-700">
                  <div className="mb-0.5 font-semibold">{vs.title}</div>
                  {vs.lines.length ? (
                    <ul className="m-0 pl-4">
                      {vs.lines.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-neutral-500">詳細情報がありません。</div>
                  )}
                </div>

                {vi ? (
                  <details className="text-xs text-neutral-600">
                    <summary className="cursor-pointer">車両情報（raw）</summary>
                    <pre className="mt-2 whitespace-pre-wrap">
                      {JSON.stringify(vi, null, 2)}
                    </pre>
                  </details>
                ) : null}

                <div className="flex justify-between gap-2.5">
                  <div className="text-xs text-neutral-500">Public ID: {r.public_id}</div>
                  <div className="text-xs text-neutral-600">証明書を開く →</div>
                </div>
              </div>
            </a>
          );
        })}

        {rows.length === 0 && !err && !loading ? <div className="text-sm text-neutral-500">対象の証明書がありません。</div> : null}
      </div>

    </main>
  );
}
