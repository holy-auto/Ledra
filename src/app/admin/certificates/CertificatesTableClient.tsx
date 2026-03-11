"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";

type Row = {
  public_id: string;
  status: string;
  customer_name: string;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  const s = String(status ?? "").toLowerCase();
  if (s === "active")
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        有効
      </span>
    );
  if (s === "void")
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500 ring-1 ring-neutral-200">
        無効
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-neutral-200">
      {status}
    </span>
  );
}

export default function CertificatesTableClient({ rows, q }: { rows: Row[]; q: string }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const bs = useAdminBillingStatus();
  const isActive = bs.data?.is_active ?? true;
  const planTier = bs.data?.plan_tier ?? "pro";
  const denyReason = !isActive ? "inactive" : "plan";

  const returnTo = useMemo(() => `/admin/certificates${q ? `?q=${encodeURIComponent(q)}` : ""}`, [q]);
  const bill = (action: string) => buildBillingDenyUrl({ reason: denyReason, action, returnTo });

  const allIds = useMemo(() => rows.map((r) => r.public_id), [rows]);
  const selectedIds = useMemo(() => allIds.filter((id) => selected[id]), [allIds, selected]);

  const allChecked = allIds.length > 0 && selectedIds.length === allIds.length;
  const someChecked = selectedIds.length > 0 && selectedIds.length < allIds.length;

  const toggleAll = (on: boolean) => {
    const next: Record<string, boolean> = {};
    if (on) for (const id of allIds) next[id] = true;
    setSelected(next);
  };

  const toggleOne = (id: string, on: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: on }));
  };

  const exportUrl = useMemo(() => {
    const ids = selectedIds.map(encodeURIComponent).join(",");
    return `/admin/certificates/export-selected?ids=${ids}`;
  }, [selectedIds]);

  const pdfZipUrl = useMemo(() => {
    const ids = selectedIds.map(encodeURIComponent).join(",");
    return `/admin/certificates/pdf-selected?ids=${ids}`;
  }, [selectedIds]);

  const canCsvSearch = isActive && canUseFeature(planTier, "export_search_csv");
  const canCsvSelected = isActive && canUseFeature(planTier, "export_selected_csv");
  const canPdfZip = isActive && canUseFeature(planTier, "pdf_zip");
  const canCsvOne = isActive && canUseFeature(planTier, "export_one_csv");
  const canPdfOne = isActive && canUseFeature(planTier, "pdf_one");

  const hrefOrBill = (enabled: boolean, href: string, action: string) => (enabled ? href : bill(action));

  const actionBtn = (enabled: boolean) =>
    enabled
      ? "rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
      : "rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-400 cursor-not-allowed";

  return (
    <div className="space-y-4">
      {/* Billing warning */}
      {bs.data && !bs.data.is_active ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          お支払い停止中のため、出力（CSV/PDF）はご利用いただけません。{" "}
          <Link className="underline font-medium" href="/admin/billing">
            課金ページへ
          </Link>
        </div>
      ) : null}

      {/* Bulk actions toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-neutral-500">
          選択中: <span className="font-semibold text-neutral-900">{selectedIds.length}</span> 件
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <button
            type="button"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            onClick={() => toggleAll(true)}
            disabled={allIds.length === 0}
          >
            全選択
          </button>
          <button
            type="button"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
            onClick={() => toggleAll(false)}
            disabled={selectedIds.length === 0}
          >
            全解除
          </button>

          <Link
            className={actionBtn(selectedIds.length > 0 && canCsvSelected)}
            href={hrefOrBill(selectedIds.length > 0 && canCsvSelected, exportUrl, "export_selected_csv")}
            aria-disabled={!(selectedIds.length > 0 && canCsvSelected)}
            title={!(selectedIds.length > 0 && canCsvSelected) ? "利用不可 → 課金ページへ" : ""}
          >
            選択CSV
          </Link>

          <Link
            className={actionBtn(selectedIds.length > 0 && canPdfZip)}
            href={hrefOrBill(selectedIds.length > 0 && canPdfZip, pdfZipUrl, "pdf_zip")}
            aria-disabled={!(selectedIds.length > 0 && canPdfZip)}
            title={!(selectedIds.length > 0 && canPdfZip) ? "利用不可 → 課金ページへ" : ""}
          >
            選択PDF（ZIP）
          </Link>

          <Link
            className={actionBtn(canCsvSearch)}
            href={hrefOrBill(canCsvSearch, `/admin/certificates/export?q=${encodeURIComponent(q)}`, "export_search_csv")}
            aria-disabled={!canCsvSearch}
            title={!canCsvSearch ? "利用不可 → 課金ページへ" : ""}
          >
            CSV（検索結果）
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="p-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
              <th className="p-3 text-left font-semibold text-neutral-600">作成日時</th>
              <th className="p-3 text-left font-semibold text-neutral-600">証明書 ID</th>
              <th className="p-3 text-left font-semibold text-neutral-600">顧客名</th>
              <th className="p-3 text-left font-semibold text-neutral-600">ステータス</th>
              <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const isVoid = r.status === "void";
              const checked = !!selected[r.public_id];

              return (
                <tr key={r.public_id} className={`border-t hover:bg-neutral-50 ${isVoid ? "opacity-60" : ""}`}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleOne(r.public_id, e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap text-neutral-600">
                    {new Date(r.created_at).toLocaleString("ja-JP")}
                  </td>
                  <td className="p-3 font-mono text-xs text-neutral-700">{r.public_id}</td>
                  <td className="p-3 font-medium text-neutral-900">{r.customer_name}</td>
                  <td className="p-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 flex-wrap">
                      <Link
                        href={`/admin/certificates/${r.public_id}`}
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        詳細
                      </Link>
                      <Link
                        href={`/c/${r.public_id}`}
                        target="_blank"
                        className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                      >
                        公開
                      </Link>
                      <Link
                        className={actionBtn(canCsvOne)}
                        href={hrefOrBill(canCsvOne, `/admin/certificates/export-one?pid=${encodeURIComponent(r.public_id)}`, "export_one_csv")}
                        aria-disabled={!canCsvOne}
                        title={!canCsvOne ? "利用不可 → 課金ページへ" : ""}
                      >
                        CSV
                      </Link>
                      <Link
                        className={actionBtn(canPdfOne)}
                        href={hrefOrBill(canPdfOne, `/admin/certificates/pdf-one?pid=${encodeURIComponent(r.public_id)}`, "pdf_one")}
                        aria-disabled={!canPdfOne}
                        title={!canPdfOne ? "利用不可 → 課金ページへ" : ""}
                      >
                        PDF
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="p-8 text-center text-sm text-neutral-500" colSpan={6}>
                  {q ? `「${q}」に一致する証明書が見つかりません。` : "証明書がまだ発行されていません。"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-400">
        ※ 選択PDFはZIPでまとめてダウンロードされます（上限50件）。
      </p>
    </div>
  );
}
