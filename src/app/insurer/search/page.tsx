import Link from "next/link";
import { headers } from "next/headers";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(v: string | string[] | undefined): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

function asText(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function asNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}


async function getRequestInfo() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const cookie = h.get("cookie") ?? "";
  return {
    baseUrl: `${proto}://${host}`,
    cookie,
  };
}

async function fetchSearch(sp: Record<string, string | string[] | undefined>) {
  const { baseUrl, cookie } = await getRequestInfo();
  const qs = new URLSearchParams();

  const keys = [
    "q",
    "status",
    "public_id",
    "plate",
    "plate_display",
    "customer_name",
    "model",
    "maker",
    "vin"
  ] as const;

  for (const key of keys) {
    const value = first(sp[key]).trim();
    if (value) qs.set(key, value);
  }

  const url = `${baseUrl}/api/insurer/search${qs.toString() ? `?${qs.toString()}` : ""}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  const rawText = await res.text();

  let json: any = {};
  try {
    json = rawText ? JSON.parse(rawText) : {};
  } catch {
    json = { error: rawText || "invalid_json" };
  }

  const rows = Array.isArray(json?.rows)
    ? json.rows
    : Array.isArray(json)
      ? json
      : [];

  return {
    ok: res.ok,
    status: res.status,
    rows,
    raw: json,
  };
}

function getRowPublicId(row: any): string {
  return asText(
    row?.latest_active_certificate_public_id ??
    row?.latest_certificate_public_id ??
    row?.public_id ??
    row?.certificate_public_id ??
    row?.c_public_id ??
    row?.pid
  );
}

function getRowVehiclePublicId(row: any): string {
  return asText(
    row?.vehicle_public_id ??
    row?.v_public_id ??
    row?.vehicle_pid
  );
}

function getRowStatus(row: any): string {
  return asText(
    row?.latest_active_certificate_status ??
    row?.latest_certificate_status ??
    row?.status ??
    row?.certificate_status ??
    row?.c_status
  ) || "-";
}

function getRowCustomer(row: any): string {
  return asText(
    row?.latest_active_certificate_customer_name ??
    row?.latest_certificate_customer_name ??
    row?.customer_name ??
    row?.certificate_customer_name ??
    row?.vehicle_customer_name
  ) || "-";
}

function getRowModel(row: any): string {
  return asText(
    row?.vehicle_model ??
    row?.model ??
    row?.latest_certificate_vehicle_model
  ) || "-";
}

function getRowPlate(row: any): string {
  return asText(
    row?.vehicle_plate_display ??
    row?.vehicle_plate ??
    row?.plate_display ??
    row?.plate ??
    row?.latest_certificate_plate_display
  ) || "-";
}

function getRowVin(row: any): string {
  return asText(
    row?.vehicle_vin ??
    row?.vin_code ??
    row?.vin
  ) || "-";
}

function getRowCreatedAt(row: any): string {
  return asText(
    row?.latest_active_certificate_created_at ??
    row?.latest_certificate_created_at ??
    row?.created_at ??
    row?.certificate_created_at
  );
}

function getRowImageCount(row: any): number {
  return asNumber(
    row?.latest_active_image_count ??
    row?.latest_certificate_image_count ??
    row?.image_count ??
    row?.images_count ??
    row?.attached_image_count
  );
}

function getRowLatestImageUrl(row: any): string {
  return asText(
    row?.latest_active_image_url ??
    row?.latest_certificate_image_url ??
    row?.latest_image_url ??
    row?.image_url ??
    row?.latest_signed_image_url
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const q = first(sp.q).trim();
  const status = first(sp.status).trim();

  const result = await fetchSearch(sp);
  const rows = result.rows as any[];

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              証明書検索
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                証明書検索
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                必ず <span className="font-mono">/api/insurer/search</span> を経由して検索結果を表示します。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Link
              href="/insurer"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              保険会社TOPへ
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <form action="/insurer/search" method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_120px_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="public_id / 顧客名 / ナンバー / 車種"
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm"
            />

            <select
              name="status"
              defaultValue={status}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm"
            >
              <option value="">全ステータス</option>
              <option value="active">有効 (active)</option>
              <option value="void">無効 (void)</option>
              <option value="expired">期限切れ (expired)</option>
            </select>

            <button
              type="submit"
              className="btn-primary px-4 py-3"
            >
              検索
            </button>

            <a
              href={`/api/insurer/export${(() => {
                const qs = new URLSearchParams();
                if (q) qs.set("q", q);
                if (status) qs.set("status", status);
                return qs.toString() ? `?${qs.toString()}` : "";
              })()}`}
              className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              CSVエクスポート
            </a>
          </form>
        </section>

        {!result.ok ? (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-5 shadow-sm">
            <div className="text-lg font-semibold text-red-700">検索APIエラー</div>
            <div className="mt-2 text-sm text-red-700">HTTP {result.status}</div>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-red-100 p-4 text-xs text-red-900">
{JSON.stringify(result.raw, null, 2)}
            </pre>
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">RESULTS</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{rows.length}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">QUERY</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">{q || "-"}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">STATUS FILTER</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">{status || "-"}</div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">SOURCE</div>
            <div className="mt-2 text-sm font-medium text-neutral-900">/api/insurer/search</div>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">SEARCH RESULT TABLE</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">検索結果</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="p-3 text-left">作成日時</th>
                  <th className="p-3 text-left">public_id</th>
                  <th className="p-3 text-left">状態</th>
                  <th className="p-3 text-left">顧客名</th>
                  <th className="p-3 text-left">車種</th>
                  <th className="p-3 text-left">ナンバー</th>
                  <th className="p-3 text-left">車台番号</th>
                  <th className="p-3 text-left">画像</th>
                  <th className="p-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const publicId = getRowPublicId(row);
                  const vehiclePublicId = getRowVehiclePublicId(row);
                  const imageCount = getRowImageCount(row);
                  const latestImageUrl = getRowLatestImageUrl(row);
                  const statusText = getRowStatus(row);
                  const isVoid = statusText.toLowerCase() === "void";
                  const hasCertificate = !!publicId;

                  return (
                    <tr key={`${publicId || vehiclePublicId || "row"}_${idx}`} className="border-t align-top">
                      <td className="p-3 whitespace-nowrap">{formatDateTime(getRowCreatedAt(row))}</td>
                      <td className="p-3 font-mono">
                        {publicId || <span className="text-xs text-neutral-500">証明書未発行</span>}
                      </td>
                      <td className="p-3">
                        {hasCertificate ? (
                          <span className={isVoid ? "text-red-700" : "text-emerald-700"}>
                            {isVoid ? "無効の施工証明書" : statusText === "active" ? "有効な施工証明書" : statusText}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500">-</span>
                        )}
                      </td>
                      <td className="p-3">{getRowCustomer(row)}</td>
                      <td className="p-3">{getRowModel(row)}</td>
                      <td className="p-3">{getRowPlate(row)}</td>
                      <td className="p-3 font-mono text-xs">{getRowVin(row)}</td>
                      <td className="p-3">
                        <div className="space-y-2">
                          <div>{imageCount}枚</div>
                          {latestImageUrl ? (
                            <a href={latestImageUrl} target="_blank" rel="noreferrer">
                              <img
                                src={latestImageUrl}
                                alt={publicId ? `${publicId}_latest_image` : "latest_image"}
                                className="h-20 w-28 rounded-lg border border-neutral-200 bg-white object-cover"
                              />
                            </a>
                          ) : (
                            <div className="text-xs text-neutral-500">画像URLなし</div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {hasCertificate ? (
                          <div className="flex flex-col gap-2">
                            <Link
                              href={`/insurer/c/${encodeURIComponent(publicId)}`}
                              className="underline"
                            >
                              詳細
                            </Link>
                            <Link
                              href={`/c/${encodeURIComponent(publicId)}`}
                              target="_blank"
                              className="underline"
                            >
                              公開ページ
                            </Link>
                            <Link
                              href={`/insurer/cases?create=true${row.vehicle_id ? `&vehicle_id=${row.vehicle_id}` : ""}`}
                              className="text-sm font-medium text-neutral-600 hover:text-neutral-800 hover:underline"
                            >
                              案件作成
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-neutral-500">
                            車両一致のみ
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 ? (
                  <tr>
                    <td className="p-6 text-neutral-500" colSpan={9}>
                      該当なし
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
