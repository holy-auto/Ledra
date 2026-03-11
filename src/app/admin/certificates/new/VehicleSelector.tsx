"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_name: string | null;
  customer_email: string | null;
  notes: string | null;
  created_at?: string | null;
};

type FillableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function compact(parts: Array<string | number | null | undefined>) {
  return parts
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function labelOf(row: VehicleRow) {
  const head = compact([row.year, row.maker, row.model]);
  return compact([head, row.plate_display ? `(${row.plate_display})` : ""]);
}

function modelTextOf(row: VehicleRow) {
  return compact([row.year, row.maker, row.model]);
}

function setIfEmpty(selector: string, rawValue: string | null | undefined) {
  const value = String(rawValue ?? "").trim();
  if (!value) return;

  const el = document.querySelector(selector) as FillableElement | null;
  if (!el) return;

  if (String(el.value ?? "").trim()) return;

  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function VehicleSelector({ initialRows = [] }: { initialRows?: VehicleRow[] }) {
  const [rows, setRows] = useState<VehicleRow[]>(initialRows);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(initialRows.length === 0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      setValue(sp.get("vehicle_id") ?? "");
    } catch {
      setValue("");
    }
  }, []);

  useEffect(() => {
    let alive = true;

    if (initialRows.length > 0) {
      setRows(initialRows);
      setLoading(false);
      setErr(null);
      return () => {
        alive = false;
      };
    }

    (async () => {
      setLoading(true);
      setErr(null);

      const supabase = createClient();
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display, customer_name, customer_email, notes, created_at")
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setRows([]);
        setErr(error.message);
      } else {
        setRows((data ?? []) as VehicleRow[]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [initialRows]);

  const selected = useMemo(
    () => rows.find((row) => row.id === value) ?? null,
    [rows, value]
  );

  useEffect(() => {
    if (!selected) return;

    setIfEmpty('input[name="customer_name"]', selected.customer_name);
    setIfEmpty('input[name="customer_email"]', selected.customer_email);
    setIfEmpty('input[name="model"]', modelTextOf(selected));
    setIfEmpty('input[name="plate"]', selected.plate_display);
  }, [selected]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-800">対象車両 *</label>
          <div className="text-xs text-neutral-500">
            車両選択で顧客名・車種・ナンバーを、下の入力欄が空欄のときだけ補完します。
          </div>

          <select
            name="vehicle_id"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-sm"
            required
          >
            <option value="">{loading ? "車両を読み込み中..." : "車両を選択してください"}</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {labelOf(row) || row.id}
                {row.customer_name ? ` / ${row.customer_name}` : ""}
              </option>
            ))}
          </select>
        </div>

        <Link
          href="/admin/vehicles/new?returnTo=/admin/certificates/new"
          className="inline-flex rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          ＋ 新しい車両を登録
        </Link>
      </div>

      {!loading && !err && rows.length === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          登録済み車両がありません。先に車両登録を行ってください。
        </div>
      ) : null}

      {selected ? (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-neutral-900">選択中の車両</div>
            <Link
              href={`/admin/vehicles/${selected.id}/edit`}
              className="text-xs font-medium text-neutral-600 underline"
            >
              この車両を編集
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500">VEHICLE</div>
              <div className="mt-1 text-sm text-neutral-900">{labelOf(selected) || "-"}</div>
            </div>

            <div className="rounded-xl bg-white p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500">CUSTOMER</div>
              <div className="mt-1 text-sm text-neutral-900">{selected.customer_name || "-"}</div>
            </div>

            <div className="rounded-xl bg-white p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500">EMAIL</div>
              <div className="mt-1 text-sm text-neutral-900 break-all">
                {selected.customer_email || "-"}
              </div>
            </div>

            <div className="rounded-xl bg-white p-3">
              <div className="text-[11px] font-semibold tracking-[0.16em] text-neutral-500">NOTES</div>
              <div className="mt-1 text-sm text-neutral-900">{selected.notes || "-"}</div>
            </div>
          </div>

          <div className="text-xs text-neutral-500">
            上の車両情報は確認用です。顧客名・車種・ナンバーは、下の入力欄が空欄のときだけ自動補完されます。
          </div>
        </div>
      ) : null}

      {!loading && value && !selected ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          指定された車両が見つかりませんでした。別の車両を選択するか、新規登録してください。
        </div>
      ) : null}

      {selected && !String(selected.customer_name ?? "").trim() ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">選択車両に顧客名が未登録です</div>
          <div className="mt-1">
            車両管理で顧客情報を入力してください。
            <Link
              href={`/admin/vehicles/${selected.id}/edit`}
              className="ml-2 font-medium underline"
            >
              この車両を編集
            </Link>
          </div>
        </div>
      ) : null}

      {err ? (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}
    </div>
  );
}