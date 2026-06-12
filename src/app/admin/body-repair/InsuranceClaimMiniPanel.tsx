"use client";

import { useCallback, useEffect, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";
import {
  ClaimDialog,
  StatusBadge,
  formatYen,
  type InsuranceClaim,
} from "@/app/admin/insurance-claims/InsuranceClaimsClient";

/**
 * 鈑金案件 (body_repair_jobs) に紐づく保険協定 (insurance_claims) を
 * 一覧表示し、追加/編集できるミニパネル。
 * BodyRepairClient の案件詳細から bodyRepairJobId を渡して埋め込む。
 */
export default function InsuranceClaimMiniPanel({ bodyRepairJobId }: { bodyRepairJobId: string }) {
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceClaim | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ body_repair_job_id: bodyRepairJobId });
      const res = await fetch(`/api/admin/insurance-claims?${params.toString()}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setClaims(Array.isArray(data.claims) ? data.claims : []);
      setError(null);
    } catch {
      setError("保険協定の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [bodyRepairJobId]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-primary">損保協定</h4>
        <MutationGuard>
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-md bg-accent/15 px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/25"
          >
            + 協定を追加
          </button>
        </MutationGuard>
      </div>

      {loading ? (
        <div className="py-3 text-center text-xs text-muted">読み込み中…</div>
      ) : error ? (
        <div className="py-3 text-center text-xs text-danger">{error}</div>
      ) : claims.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted">協定はまだ登録されていません</p>
      ) : (
        <ul className="space-y-1.5">
          {claims.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border-subtle px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-primary">{c.insurance_company}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <StatusBadge status={c.status} />
                  {c.agreed_amount != null && (
                    <span className="text-[11px] font-semibold text-accent">{formatYen(c.agreed_amount)}</span>
                  )}
                </div>
              </div>
              <MutationGuard>
                <button
                  onClick={() => setEditing(c)}
                  className="shrink-0 rounded border border-border-default px-2 py-0.5 text-[11px] text-secondary transition-colors hover:bg-surface-active hover:text-primary"
                >
                  編集
                </button>
              </MutationGuard>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <ClaimDialog
          mode="create"
          presetJobId={bodyRepairJobId}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await fetchClaims();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
      {editing && (
        <ClaimDialog
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await fetchClaims();
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}
