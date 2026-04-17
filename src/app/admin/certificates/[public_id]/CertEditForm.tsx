"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type CertData = {
  public_id: string;
  customer_name: string;
  vehicle_info_json: Record<string, unknown>;
  content_free_text: string | null;
  expiry_value: string | null;
  expiry_date: string | null;
  warranty_period_end: string | null;
  maintenance_date: string | null;
  warranty_exclusions: string | null;
  remarks: string | null;
  service_type: string | null;
};

type Props = {
  cert: CertData;
};

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-secondary";

export default function CertEditForm({ cert }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const info = cert.vehicle_info_json ?? {};

  const [form, setForm] = useState({
    customer_name: cert.customer_name ?? "",
    vehicle_maker: String((info as any).maker ?? ""),
    vehicle_model: String((info as any).model ?? ""),
    vehicle_plate: String((info as any).plate ?? ""),
    content_free_text: cert.content_free_text ?? "",
    expiry_value: cert.expiry_value ?? "",
    expiry_date: cert.expiry_date ?? "",
    warranty_period_end: cert.warranty_period_end ?? "",
    maintenance_date: cert.maintenance_date ?? "",
    warranty_exclusions: cert.warranty_exclusions ?? "",
    remarks: cert.remarks ?? "",
  });

  const handleSave = () => {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/certificates/edit", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_id: cert.public_id,
            customer_name: form.customer_name.trim(),
            vehicle_info_json: {
              maker: form.vehicle_maker.trim(),
              model: form.vehicle_model.trim(),
              plate: form.vehicle_plate.trim(),
            },
            content_free_text: form.content_free_text.trim() || null,
            expiry_value: form.expiry_value.trim() || null,
            expiry_date: form.expiry_date || null,
            warranty_period_end: form.warranty_period_end || null,
            maintenance_date: form.maintenance_date || null,
            warranty_exclusions: form.warranty_exclusions.trim() || null,
            remarks: form.remarks.trim() || null,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.message ?? "保存に失敗しました。");
          return;
        }

        if (data.changed) {
          setSuccess(`${data.changes_count}件の変更を保存しました (v${data.version})`);
          setEditing(false);
          router.refresh();
        } else {
          setSuccess("変更はありません。");
        }
      } catch {
        setError("保存に失敗しました。");
      }
    });
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setEditing(true);
            setSuccess(null);
            setError(null);
          }}
          className="rounded-xl border border-border-default bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
        >
          編集する
        </button>
        {success && <span className="text-xs text-accent">{success}</span>}
      </div>
    );
  }

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="glass-card p-5 space-y-5">
      <div>
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">EDIT</div>
        <div className="mt-1 text-lg font-semibold text-primary">証明書を編集</div>
        <p className="mt-1 text-xs text-muted">変更内容は編集履歴に記録されます。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          <span className={labelTextCls}>顧客名</span>
          <input value={form.customer_name} onChange={set("customer_name")} className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>メーカー</span>
          <input value={form.vehicle_maker} onChange={set("vehicle_maker")} className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>車種</span>
          <input value={form.vehicle_model} onChange={set("vehicle_model")} className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>ナンバー</span>
          <input value={form.vehicle_plate} onChange={set("vehicle_plate")} className={inputCls} />
        </label>
      </div>

      <label className={`${labelCls} block`}>
        <span className={labelTextCls}>施工内容（自由記述）</span>
        <textarea value={form.content_free_text} onChange={set("content_free_text")} className={inputCls} rows={4} />
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          <span className={labelTextCls}>有効条件</span>
          <input value={form.expiry_value} onChange={set("expiry_value")} className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>有効期限</span>
          <input type="date" value={form.expiry_date} onChange={set("expiry_date")} className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>保証期間（終了日）</span>
          <input
            type="date"
            value={form.warranty_period_end}
            onChange={set("warranty_period_end")}
            className={inputCls}
          />
        </label>
        <label className={labelCls}>
          <span className={labelTextCls}>メンテナンス実施日</span>
          <input type="date" value={form.maintenance_date} onChange={set("maintenance_date")} className={inputCls} />
        </label>
      </div>

      <label className={`${labelCls} block`}>
        <span className={labelTextCls}>保証除外内容</span>
        <textarea
          value={form.warranty_exclusions}
          onChange={set("warranty_exclusions")}
          className={inputCls}
          rows={3}
        />
      </label>

      <label className={`${labelCls} block`}>
        <span className={labelTextCls}>備考</span>
        <textarea value={form.remarks} onChange={set("remarks")} className={inputCls} rows={2} />
      </label>

      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim px-4 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="flex gap-3 items-center">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-inverse hover:bg-accent/90 disabled:opacity-50"
        >
          {isPending ? "保存中…" : "変更を保存"}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
          disabled={isPending}
          className="rounded-xl border border-border-default bg-surface px-5 py-2.5 text-sm font-medium text-primary hover:bg-surface-hover"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
