"use client";

import { useCallback, useEffect, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatDate } from "@/lib/format";

export type HoldSelection = { date: string; start: string; end: string };

type Candidate = {
  date: string;
  start_time: string;
  end_time: string;
  slot_end: string;
  remaining: number;
};

/**
 * 取引先(partnerTenantId)の空き枠を表示し、1枠を選んで仮押さえ対象にするピッカー。
 * 相手が空きを公開していない（403）ときは案内のみ表示し、枠選択は出さない。
 */
export default function PartnerAvailabilityPicker({
  partnerTenantId,
  value,
  onSelect,
}: {
  partnerTenantId: string;
  value: HoldSelection | null;
  onSelect: (v: HoldSelection | null) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [notShared, setNotShared] = useState(false);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setNotShared(false);
    try {
      const res = await fetch(`/api/admin/partners/availability?partner_tenant_id=${partnerTenantId}`, {
        cache: "no-store",
      });
      if (res.status === 403) {
        setNotShared(true);
        setCandidates([]);
        return;
      }
      const j = await parseJsonSafe(res);
      setCandidates(j?.candidates ?? []);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [partnerTenantId]);

  useEffect(() => {
    if (partnerTenantId) fetchAvailability();
  }, [partnerTenantId, fetchAvailability]);

  const dates = [...new Set(candidates.map((c) => c.date))].sort();
  const daySlots = candidates.filter((c) => c.date === (activeDate ?? dates[0]));

  if (!partnerTenantId) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-hover p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-secondary">相手店舗の空き枠を押さえる（任意）</p>
        {value && (
          <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => onSelect(null)}>
            枠を外す
          </button>
        )}
      </div>

      {loading && <p className="text-[11px] text-muted">空き状況を取得中…</p>}

      {notShared && (
        <p className="text-[11px] text-muted">この取引先は空き状況を公開していません（枠押さえは利用できません）。</p>
      )}

      {!loading && !notShared && candidates.length === 0 && (
        <p className="text-[11px] text-muted">直近に空き枠がありません。</p>
      )}

      {value && (
        <div className="text-xs text-primary">
          選択中:{" "}
          <span className="font-semibold">
            {formatDate(value.date)} {value.start.slice(0, 5)}〜{value.end.slice(0, 5)}
          </span>
        </div>
      )}

      {!loading && !notShared && candidates.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setActiveDate(d)}
                className={`text-xs px-2 py-1 rounded border ${
                  (activeDate ?? dates[0]) === d
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-secondary"
                }`}
              >
                {formatDate(d)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {daySlots.map((c) => {
              const selected = value?.date === c.date && value?.start === c.start_time && value?.end === c.slot_end;
              return (
                <button
                  key={`${c.date}-${c.start_time}`}
                  type="button"
                  onClick={() => onSelect({ date: c.date, start: c.start_time, end: c.slot_end })}
                  className={`text-xs px-2 py-1 rounded border ${
                    selected ? "border-accent bg-accent text-white" : "border-border text-primary hover:bg-surface"
                  }`}
                >
                  {c.start_time.slice(0, 5)}〜{c.slot_end.slice(0, 5)}
                  {c.remaining > 1 ? `（残${c.remaining}）` : ""}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
