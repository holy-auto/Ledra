"use client";

import { useEffect, useState } from "react";

type BillingTiming = "on_inspection" | "monthly";

const OPTIONS: { value: BillingTiming; label: string; description: string }[] = [
  {
    value: "on_inspection",
    label: "都度払い",
    description: "検収完了のたびに即時請求書を送付します。スポット案件や取引量が少ない場合に適しています。",
  },
  {
    value: "monthly",
    label: "末締め翌月末払い",
    description: "当月の完了案件を月末にまとめて合算請求書で送付します。支払期限は翌月末です。",
  },
];

export default function BillingTimingSection() {
  const [current, setCurrent] = useState<BillingTiming>("on_inspection");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/billing-settings")
      .then((r) => r.json())
      .then((j) => { if (j.billing_timing) setCurrent(j.billing_timing); })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (value: BillingTiming) => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/billing-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billing_timing: value }),
      });
      if (res.ok) {
        setCurrent(value);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted">読み込み中...</div>;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-primary">請求タイミング</h3>
        <p className="text-xs text-muted mt-0.5">
          発注企業への請求書送付タイミングを設定します。新規発注時に自動で引き継がれます。
        </p>
      </div>

      <div className="space-y-2">
        {OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
              current === opt.value
                ? "border-accent bg-accent/5"
                : "border-border hover:border-border-hover"
            }`}
          >
            <input
              type="radio"
              name="billing_timing"
              value={opt.value}
              checked={current === opt.value}
              onChange={() => handleSave(opt.value)}
              disabled={saving}
              className="mt-0.5 accent-accent"
            />
            <div>
              <div className="text-sm font-medium text-primary">{opt.label}</div>
              <div className="text-xs text-muted mt-0.5">{opt.description}</div>
            </div>
          </label>
        ))}
      </div>

      {saved && <p className="text-xs text-success">保存しました</p>}
      {saving && <p className="text-xs text-muted">保存中...</p>}
    </div>
  );
}
