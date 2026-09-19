"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProjectClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name") as string,
      description: (fd.get("description") as string) || undefined,
      product_name: (fd.get("product_name") as string) || undefined,
      budget: fd.get("budget") ? Number(fd.get("budget")) : undefined,
      target_units: fd.get("target_units") ? Number(fd.get("target_units")) : undefined,
      starts_at: (fd.get("starts_at") as string) || undefined,
      ends_at: (fd.get("ends_at") as string) || undefined,
    };

    try {
      const res = await fetch("/api/manufacturer/field-test/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "作成に失敗しました。");
      router.push(`/manufacturer/field-test/${json.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました。");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5">
      {error && (
        <div className="rounded-md border border-danger-border bg-danger-dim p-3 text-sm text-danger-text">{error}</div>
      )}

      <Field label="プロジェクト名" name="name" required />
      <Field label="対象製品" name="product_name" />
      <TextArea label="概要" name="description" />

      <div className="grid grid-cols-2 gap-4">
        <Field label="予算 (円)" name="budget" type="number" />
        <Field label="目標施工台数" name="target_units" type="number" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="開始日" name="starts_at" type="date" />
        <Field label="終了日" name="ends_at" type="date" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-border-subtle px-4 py-2 text-xs font-medium text-secondary hover:bg-surface-hover"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-6 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? "作成中..." : "作成"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-secondary">
        {label}
        {required && <span className="text-danger-text ml-0.5">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}

function TextArea({ label, name }: { label: string; name: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-secondary">{label}</span>
      <textarea
        name={name}
        rows={3}
        className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-primary placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}
