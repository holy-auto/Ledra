"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";
import { formatDateTime } from "@/lib/format";

type Row = {
  public_id: string;
  status: string;
  customer_name: string;
  created_at: string;
};

export default function CertificatesTableClient({ rows, q }: { rows: Row[]; q: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const handleVoid = useCallback(async (publicId: string) => {
    if (!confirm("この証明書を削除（無効化）しますか？\n※ 内部的にはvoid扱いとなり、復元はできません。")) return;
    setVoidingId(publicId);
    try {
      const res = await fetch("/api/admin/certificates/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ public_id: publicId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      router.refresh();
    } catch (e: any) {
      alert("削除に失敗しました: " + (e?.message ?? String(e)));
    } finally {
      setVoidingId(null);
    }
  }, [router]);

  const bs = useAdminBillingStatus();
  const isActive = bs.data?.is_active ?? true; // 取得失敗時は従来どおり（APIが最後に止める）
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

  const btnCls = (enabled: boolean) => "btn-secondary " + (enabled ? "" : "opacity-50");
  const linkCls = (enabled: boolean) => "underline text-[#0071e3] hover:text-[#0077ED] " + (enabled ? "" : "opacity-50");

  const hrefOrBill = (enabled: boolean, href: string, action: string) => (enabled ? href : bill(action));

  return (
    <div className="space-y-3">
      {bs.data && !bs.data.is_active ? (
        <div className="rounded-xl border border-amber-500/30 p-3 text-sm bg-[rgba(245,158,11,0.1)] text-amber-400">
          お支払い停止中のため、出力（CSV/PDF）はご利用いただけません。{" "}
          <Link className="underline text-amber-300 hover:text-amber-200" href="/admin/billing">
            課金ページへ
          </Link>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted">
          選択: <span className="font-mono">{selectedIds.length}</span> 件
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => toggleAll(true)} disabled={allIds.length === 0}>
            全選択
          </button>
          <button type="button" className="btn-secondary" onClick={() => toggleAll(false)} disabled={allIds.length === 0}>
            全解除
          </button>

          <Link
            className={btnCls(selectedIds.length > 0 && canCsvSelected)}
            href={hrefOrBill(selectedIds.length > 0 && canCsvSelected, exportUrl, "export_selected_csv")}
            aria-disabled={!(selectedIds.length > 0 && canCsvSelected)}
            title={!(selectedIds.length > 0 && canCsvSelected) ? "利用不可 → 課金ページへ" : ""}
          >
            選択CSV
          </Link>

          <Link
            className={btnCls(selectedIds.length > 0 && canPdfZip)}
            href={hrefOrBill(selectedIds.length > 0 && canPdfZip, pdfZipUrl, "pdf_zip")}
            aria-disabled={!(selectedIds.length > 0 && canPdfZip)}
            title={!(selectedIds.length > 0 && canPdfZip) ? "利用不可 → 課金ページへ" : ""}
          >
            選択PDF（ZIP）
          </Link>

          <Link
            className={linkCls(canCsvSearch)}
            href={hrefOrBill(canCsvSearch, `/admin/certificates/export?q=${encodeURIComponent(q)}`, "export_search_csv")}
            aria-disabled={!canCsvSearch}
            title={!canCsvSearch ? "利用不可 → 課金ページへ" : ""}
          >
            CSV（検索結果）
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto border border-border-default rounded-xl">
        <table className="min-w-full text-sm">
          <thead className="bg-base">
            <tr>
              <th className="p-3 text-left w-10">
                <input
                  type="checkbox"
                  className="accent-[#0071e3]"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="text-left p-3 text-secondary">作成日時</th>
              <th className="text-left p-3 text-secondary">public_id</th>
              <th className="text-left p-3 text-secondary">お客様名</th>
              <th className="text-left p-3 text-secondary">status</th>
              <th className="text-left p-3 text-secondary">操作</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const url = `/c/${r.public_id}`;
              const isVoid = r.status === "void";
              const checked = !!selected[r.public_id];

              return (
                <tr key={r.public_id} className="border-t border-border-default hover:bg-surface-hover transition-colors">
                  <td className="p-3">
                    <input type="checkbox" className="accent-[#0071e3]" checked={checked} onChange={(e) => toggleOne(r.public_id, e.target.checked)} />
                  </td>
                  <td className="p-3 whitespace-nowrap text-primary">{formatDateTime(r.created_at)}</td>
                  <td className="p-3 font-mono text-primary">{r.public_id}</td>
                  <td className="p-3 text-primary">{r.customer_name}</td>
                  <td className="p-3">
                    <span className={isVoid ? "text-muted" : "text-primary"}>
                      {r.status === "active" ? "有効な施工証明書" : r.status === "void" ? "無効の施工証明書" : r.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3 items-center flex-wrap">
                      <Link className="underline text-[#0071e3] hover:text-[#0077ED]" href={url} target="_blank">
                        公開ページ
                      </Link>
                      <Link
                        className={linkCls(canCsvOne)}
                        href={hrefOrBill(canCsvOne, `/admin/certificates/export-one?pid=${encodeURIComponent(r.public_id)}`, "export_one_csv")}
                        aria-disabled={!canCsvOne}
                        title={!canCsvOne ? "利用不可 → 課金ページへ" : ""}
                      >
                        CSV(1件)
                      </Link>
                      <Link
                        className={linkCls(canPdfOne)}
                        href={hrefOrBill(canPdfOne, `/admin/certificates/pdf-one?pid=${encodeURIComponent(r.public_id)}`, "pdf_one")}
                        aria-disabled={!canPdfOne}
                        title={!canPdfOne ? "利用不可 → 課金ページへ" : ""}
                      >
                        PDF(1件)
                      </Link>
                      {!isVoid && (
                        <button
                          type="button"
                          className="text-red-500 hover:text-red-600 disabled:opacity-50"
                          disabled={voidingId === r.public_id}
                          onClick={() => handleVoid(r.public_id)}
                        >
                          {voidingId === r.public_id ? "削除中…" : "削除"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="p-6 text-muted" colSpan={6}>
                  該当なし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">※ 選択PDFはZIPでまとめて落ちます（上限50件）。</p>
      <p className="text-xs text-muted">
        ※ プラン制限の調整は <span className="font-mono">src/lib/billing/planFeatures.ts</span> で行います。
      </p>
    </div>
  );
}
