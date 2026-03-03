"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  public_id: string;
  status: string;
  customer_name: string;
  created_at: string;
};

export default function CertificatesTableClient({ rows, q }: { rows: Row[]; q: string }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-gray-500">
          選択: <span className="font-mono">{selectedIds.length}</span> 件
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => toggleAll(true)} disabled={allIds.length === 0}>
            全選択
          </button>
          <button type="button" className="border rounded px-3 py-2 text-sm" onClick={() => toggleAll(false)} disabled={allIds.length === 0}>
            全解除
          </button>

          <Link className={"border rounded px-3 py-2 text-sm " + (selectedIds.length === 0 ? "pointer-events-none opacity-40" : "")} href={exportUrl}>
            選択CSV
          </Link>

          <Link className={"border rounded px-3 py-2 text-sm " + (selectedIds.length === 0 ? "pointer-events-none opacity-40" : "")} href={pdfZipUrl}>
            選択PDF（ZIP）
          </Link>

          <Link className="text-sm underline" href={`/admin/certificates/export?q=${encodeURIComponent(q)}`}>
            CSV（検索結果）
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="text-left p-3">作成日時</th>
              <th className="text-left p-3">public_id</th>
              <th className="text-left p-3">お客様名</th>
              <th className="text-left p-3">status</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const url = `/c/${r.public_id}`;
              const isVoid = r.status === "void";
              const checked = !!selected[r.public_id];

              return (
                <tr key={r.public_id} className="border-t">
                  <td className="p-3">
                    <input type="checkbox" checked={checked} onChange={(e) => toggleOne(r.public_id, e.target.checked)} />
                  </td>
                  <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ja-JP")}</td>
                  <td className="p-3 font-mono">{r.public_id}</td>
                  <td className="p-3">{r.customer_name}</td>
                  <td className="p-3">
                    <span className={isVoid ? "text-gray-400" : ""}>{r.status}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3 items-center flex-wrap">
                      <Link className="underline" href={url} target="_blank">公開ページ</Link>
                      <Link className="underline" href={`/admin/certificates/export-one?pid=${encodeURIComponent(r.public_id)}`}>CSV(1件)</Link>
                      <Link className="underline" href={`/admin/certificates/pdf-one?pid=${encodeURIComponent(r.public_id)}`}>PDF(1件)</Link>
                    </div>
                  </td>
                </tr>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td className="p-6 text-gray-500" colSpan={6}>該当なし</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        ※ 選択PDFはZIPでまとめて落ちます（上限50件）。
      </p>
    </div>
  );
}