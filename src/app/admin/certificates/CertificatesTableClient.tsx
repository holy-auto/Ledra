"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminBillingStatus } from "@/lib/billing/useAdminBillingStatus";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { buildBillingDenyUrl } from "@/lib/billing/billingRedirect";
import { formatDate } from "@/lib/format";
import Badge from "@/components/ui/Badge";

type Row = {
  public_id: string;
  status: string;
  customer_name: string;
  created_at: string;
};

const statusVariant = (s: string) => {
  switch (s) {
    case "active": return "success" as const;
    case "void": return "danger" as const;
    case "expired": return "warning" as const;
    case "draft": return "default" as const;
    default: return "default" as const;
  }
};

const statusLabel = (s: string) => {
  switch (s) {
    case "active": return "有効";
    case "void": return "無効";
    case "expired": return "期限切れ";
    case "draft": return "下書き";
    default: return s;
  }
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

  const btnCls = (enabled: boolean) => "btn-secondary !text-xs " + (enabled ? "" : "opacity-50");

  const hrefOrBill = (enabled: boolean, href: string, action: string) => (enabled ? href : bill(action));

  return (
    <div className="space-y-4">
      {bs.data && !bs.data.is_active ? (
        <div className="glass-card p-4 text-sm text-amber-400">
          お支払い停止中のため、出力（CSV/PDF）はご利用いただけません。{" "}
          <Link className="underline text-amber-300 hover:text-amber-200" href="/admin/billing">
            課金ページへ
          </Link>
        </div>
      ) : null}

      {/* Bulk actions */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted">
              選択: <span className="font-mono font-semibold text-primary">{selectedIds.length}</span> 件
            </span>
            <button type="button" className="btn-ghost !text-xs" onClick={() => toggleAll(true)} disabled={allIds.length === 0}>
              全選択
            </button>
            <button type="button" className="btn-ghost !text-xs" onClick={() => toggleAll(false)} disabled={allIds.length === 0}>
              全解除
            </button>
          </div>

          <div className="flex gap-2 items-center flex-wrap">
            <Link
              className={btnCls(selectedIds.length > 0 && canCsvSelected)}
              href={hrefOrBill(selectedIds.length > 0 && canCsvSelected, exportUrl, "export_selected_csv")}
              aria-disabled={!(selectedIds.length > 0 && canCsvSelected)}
            >
              選択CSV
            </Link>

            <Link
              className={btnCls(selectedIds.length > 0 && canPdfZip)}
              href={hrefOrBill(selectedIds.length > 0 && canPdfZip, pdfZipUrl, "pdf_zip")}
              aria-disabled={!(selectedIds.length > 0 && canPdfZip)}
            >
              選択PDF（ZIP）
            </Link>

            <Link
              className={btnCls(canCsvSearch)}
              href={hrefOrBill(canCsvSearch, `/admin/certificates/export?q=${encodeURIComponent(q)}`, "export_search_csv")}
              aria-disabled={!canCsvSearch}
            >
              CSV（検索結果）
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop: table layout */}
      <div className="hidden md:block glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    className="accent-[#0071e3]"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked; }}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted whitespace-nowrap">作成日</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">証明書ID</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">お客様名</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map((r) => {
                const url = `/c/${r.public_id}`;
                const isVoid = r.status === "void";
                const checked = !!selected[r.public_id];

                return (
                  <tr key={r.public_id} className="hover:bg-surface-hover/40 transition-colors">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="accent-[#0071e3]"
                        checked={checked}
                        onChange={(e) => toggleOne(r.public_id, e.target.checked)}
                      />
                    </td>
                    <td className="p-3 whitespace-nowrap text-secondary text-xs">{formatDate(r.created_at)}</td>
                    <td className="p-3">
                      <Link
                        href={`/admin/certificates/${r.public_id}`}
                        className="font-mono text-sm text-primary hover:text-[#0071e3] transition-colors"
                        title={r.public_id}
                      >
                        {r.public_id.length > 10 ? r.public_id.slice(0, 10) + "…" : r.public_id}
                      </Link>
                    </td>
                    <td className="p-3 text-sm text-primary max-w-[200px] truncate">{r.customer_name}</td>
                    <td className="p-3">
                      <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 items-center flex-wrap">
                        <Link href={url} target="_blank" className="btn-ghost !px-3 !py-1 !text-xs">
                          公開ページ
                        </Link>
                        <Link
                          className={btnCls(canPdfOne)}
                          href={hrefOrBill(canPdfOne, `/admin/certificates/pdf-one?pid=${encodeURIComponent(r.public_id)}`, "pdf_one")}
                          aria-disabled={!canPdfOne}
                        >
                          PDF
                        </Link>
                        <Link
                          className={btnCls(canCsvOne)}
                          href={hrefOrBill(canCsvOne, `/admin/certificates/export-one?pid=${encodeURIComponent(r.public_id)}`, "export_one_csv")}
                          aria-disabled={!canCsvOne}
                        >
                          CSV
                        </Link>
                        {!isVoid && (
                          <button
                            type="button"
                            className="btn-danger !px-3 !py-1 !text-xs"
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
                  <td colSpan={6} className="p-8 text-center text-sm text-muted">
                    該当する証明書がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: card layout */}
      <section className="md:hidden glass-card overflow-hidden divide-y divide-border-subtle">
        {rows.map((r) => {
          const url = `/c/${r.public_id}`;
          const isVoid = r.status === "void";
          const checked = !!selected[r.public_id];

          return (
            <div key={r.public_id} className="hover:bg-surface-hover/40 transition-colors">
              {/* Row 1: info */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                <input
                  type="checkbox"
                  className="accent-[#0071e3] shrink-0"
                  checked={checked}
                  onChange={(e) => toggleOne(r.public_id, e.target.checked)}
                />
                <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-secondary whitespace-nowrap">{formatDate(r.created_at)}</span>
                  <Link
                    href={`/admin/certificates/${r.public_id}`}
                    className="font-mono text-sm text-primary hover:text-[#0071e3] transition-colors"
                    title={r.public_id}
                  >
                    {r.public_id.length > 8 ? r.public_id.slice(0, 8) + "…" : r.public_id}
                  </Link>
                  <span className="text-sm font-medium text-primary truncate">{r.customer_name}</span>
                </div>
                <Badge variant={statusVariant(r.status)}>
                  {statusLabel(r.status)}
                </Badge>
              </div>
              {/* Row 2: actions */}
              <div className="flex gap-2 items-center px-4 pb-3 pl-[2.75rem]">
                <Link href={url} target="_blank" className="btn-ghost !px-3 !py-1 !text-xs">
                  公開ページ
                </Link>
                <Link
                  className={btnCls(canPdfOne)}
                  href={hrefOrBill(canPdfOne, `/admin/certificates/pdf-one?pid=${encodeURIComponent(r.public_id)}`, "pdf_one")}
                  aria-disabled={!canPdfOne}
                >
                  PDF
                </Link>
                <Link
                  className={btnCls(canCsvOne)}
                  href={hrefOrBill(canCsvOne, `/admin/certificates/export-one?pid=${encodeURIComponent(r.public_id)}`, "export_one_csv")}
                  aria-disabled={!canCsvOne}
                >
                  CSV
                </Link>
                {!isVoid && (
                  <button
                    type="button"
                    className="btn-danger !px-3 !py-1 !text-xs"
                    disabled={voidingId === r.public_id}
                    onClick={() => handleVoid(r.public_id)}
                  >
                    {voidingId === r.public_id ? "削除中…" : "削除"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">
            該当する証明書がありません
          </div>
        )}
      </section>

      <p className="text-xs text-muted">※ 選択PDFはZIPでまとめてダウンロードされます（上限50件）。</p>
    </div>
  );
}
