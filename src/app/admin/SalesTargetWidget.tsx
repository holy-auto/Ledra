import Link from "next/link";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

type Progress = {
  month: string; // "YYYY-MM"
  target: number;
  actual: number;
  achievementRate: number | null;
};

export function SalesTargetWidgetSkeleton() {
  return (
    <div className="glass-card p-5 animate-pulse space-y-3">
      <div className="h-3 w-28 rounded bg-surface-hover" />
      <div className="h-8 w-44 rounded bg-surface-hover" />
      <div className="h-2 w-full rounded bg-surface-hover" />
    </div>
  );
}

function monthLabel(monthKey: string): string {
  const m = monthKey.match(/^\d{4}-(\d{2})$/);
  return m ? `${parseInt(m[1], 10)}月` : monthKey;
}

export default async function SalesTargetWidget({ tenantId }: { tenantId: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("sales_target_progress", { p_tenant_id: tenantId });
  const progress = (data ?? null) as Progress | null;

  const target = progress?.target ?? 0;
  const actual = progress?.actual ?? 0;
  const rate = progress?.achievementRate ?? (target > 0 ? Math.round((actual / target) * 1000) / 10 : null);
  const label = progress?.month ? monthLabel(progress.month) : "今月";

  // 目標未設定 → 設定への導線
  if (target <= 0) {
    return (
      <div className="glass-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">売上目標</div>
            <div className="mt-2 text-sm text-secondary">
              {label}の売上目標が未設定です。
              <span className="block text-xs text-muted mt-1">目標を設定すると達成率をリアルタイムに表示します。</span>
            </div>
          </div>
          <Link
            href="/admin/sales-targets"
            className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
          >
            目標を設定
          </Link>
        </div>
        <div className="mt-3 text-xs text-muted">
          今月の実績（入金済み）: <span className="font-semibold text-primary">¥{actual.toLocaleString()}</span>
        </div>
      </div>
    );
  }

  const pct = rate ?? 0;
  const barPct = Math.min(100, Math.max(0, pct));
  const reached = pct >= 100;
  const remaining = Math.max(0, target - actual);

  return (
    <Link href="/admin/sales-targets" className="glass-card p-5 block hover:bg-surface-hover transition-colors">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted">{label}の売上目標</div>
        <div className={`text-sm font-bold ${reached ? "text-success" : "text-accent"}`}>{pct}%</div>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-bold text-primary">¥{actual.toLocaleString()}</div>
        <div className="text-sm text-muted">/ ¥{target.toLocaleString()}</div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-surface-active overflow-hidden">
        <div
          className={`h-full rounded-full ${reached ? "bg-gradient-to-r from-success to-emerald-500" : "bg-gradient-to-r from-accent to-violet-500"}`}
          style={{ width: `${barPct}%` }}
        />
      </div>

      <div className="mt-2 text-xs text-muted">
        {reached ? (
          <span className="text-success font-medium">目標達成🎉</span>
        ) : (
          <>
            目標まであと <span className="font-semibold text-primary">¥{remaining.toLocaleString()}</span>
          </>
        )}
      </div>
    </Link>
  );
}
