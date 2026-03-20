"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

export default function VehicleListActions() {
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  async function onCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/vehicles/import-csv", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      const j = await res.json();
      if (j.inserted > 0) {
        setImportResult(`${j.inserted}件を登録しました。`);
        // Reload to reflect new vehicles
        window.location.reload();
      } else if (j.errors?.length > 0) {
        setImportResult(`エラー: ${j.errors[0].error}`);
      } else {
        setImportResult("登録できる行がありませんでした。");
      }
    } catch {
      setImportResult("インポートに失敗しました。");
    } finally {
      setImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={onCsvChange}
      />
      {importResult && (
        <span className="text-xs text-secondary">{importResult}</span>
      )}
      <Button
        type="button"
        variant="secondary"
        loading={importing}
        onClick={() => csvInputRef.current?.click()}
      >
        CSVから一括登録
      </Button>
      <Link href="/admin/vehicles/new" className="btn-primary">
        + 車両を登録
      </Link>
    </>
  );
}
