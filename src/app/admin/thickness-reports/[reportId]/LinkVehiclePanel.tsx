"use client";

/**
 * 膜厚レポート詳細ページの「車両連携」セクションに置く手動紐付けパネル。
 *
 * - 未紐付けレポートに対して「車両に紐付け」ボタン → 車両ピッカーを開く。
 * - ピッカーはナンバー / 車種 / VIN で検索 (GET /api/admin/vehicles?q=)。
 *   レポートに VIN があれば、開いた瞬間に VIN 部分一致の候補を先に提示する。
 * - 選択 → POST /api/admin/thickness-reports/[reportId]/link で紐付け → router.refresh()。
 * - 既に紐付け済みのレポートには「紐付けを解除」ボタン (DELETE) を出す。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Vehicle = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | string | null;
  plate_display: string | null;
  vin_code: string | null;
  customer?: { id: string; name: string | null } | null;
};

function vehicleLabel(v: Vehicle): string {
  const name = [v.maker, v.model, v.year].filter(Boolean).join(" ");
  return name || v.plate_display || v.vin_code || "車両";
}

export default function LinkVehiclePanel({
  reportId,
  reportVin,
  isLinked,
}: {
  reportId: string;
  reportVin: string | null;
  isLinked: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictVehicleId, setConflictVehicleId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = q.trim() ? `/api/admin/vehicles?q=${encodeURIComponent(q.trim())}` : "/api/admin/vehicles";
      const res = await fetch(url);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.message ?? "車両の取得に失敗しました。");
        setVehicles([]);
        return;
      }
      setVehicles((j.vehicles ?? []) as Vehicle[]);
    } catch {
      setError("通信エラーが発生しました。");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ピッカーを開いたら、VIN があれば VIN 一致候補を先に出す。
  useEffect(() => {
    if (!open) return;
    const initial = reportVin?.trim() ?? "";
    setQuery(initial);
    void search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 検索入力のデバウンス。
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  async function link(vehicleId: string, force = false) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/thickness-reports/${reportId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicleId, force }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setConflictVehicleId(vehicleId);
        setError(j?.message ?? "このレポートは既に別の車両に紐付けられています。");
        return;
      }
      if (!res.ok) {
        setError(j?.message ?? "紐付けに失敗しました。");
        return;
      }
      setOpen(false);
      setConflictVehicleId(null);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  async function unlink() {
    if (!confirm("この膜厚レポートの車両紐付けを解除しますか？")) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/thickness-reports/${reportId}/link`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.message ?? "紐付け解除に失敗しました。");
        return;
      }
      router.refresh();
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLinked) {
    return (
      <button type="button" onClick={unlink} disabled={submitting} className="btn-ghost text-xs py-1 px-2">
        {submitting ? "処理中…" : "紐付けを解除"}
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-sm">
          車両に紐付け
        </button>
      ) : (
        <div className="rounded-xl border border-border-default bg-surface p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-primary">紐付ける車両を選択</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setConflictVehicleId(null);
              }}
              className="text-xs text-muted hover:text-secondary"
            >
              閉じる
            </button>
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ナンバー / 車種 / VIN で検索"
            className="w-full rounded-lg border border-border-subtle bg-surface text-primary px-3 py-2 text-sm"
          />

          {reportVin && (
            <p className="text-[11px] text-muted">
              NexPTG側VIN <span className="font-mono text-secondary">{reportVin}</span>{" "}
              に一致する車両を優先表示しています。
            </p>
          )}

          {error && (
            <p className="text-xs text-danger-text bg-danger-dim border border-danger/20 rounded-lg px-2 py-1.5">
              {error}
            </p>
          )}

          <div className="max-h-64 overflow-y-auto rounded-lg border border-border-subtle divide-y divide-border-subtle">
            {loading ? (
              <div className="p-4 text-center text-xs text-muted">検索中…</div>
            ) : vehicles.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted">該当する車両がありません。</div>
            ) : (
              vehicles.map((v) => {
                const isConflict = conflictVehicleId === v.id;
                return (
                  <div key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-surface-hover">
                    <div className="min-w-0">
                      <div className="text-sm text-primary truncate">{vehicleLabel(v)}</div>
                      <div className="text-[11px] text-muted truncate">
                        {[v.plate_display, v.vin_code, v.customer?.name].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void link(v.id, isConflict)}
                      disabled={submitting}
                      className="btn-secondary text-xs py-1 px-2 shrink-0"
                    >
                      {isConflict ? "上書きして紐付け" : "紐付け"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
