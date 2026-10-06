/**
 * 保持期限 cron（/api/cron/data-retention）の処理件数を、テナント別の監査イベントにまとめる。 [G2]
 *
 * テナントの管理者が自分の audit_logs で見られるよう、テナントごとに 1 行（テーブル別件数つき）にする。テナントを持たない
 * 行（stripe_processed_events 等）は tenant_id=NULL の 1 行にまとめる。削除（行を消す）と秘匿化（座標だけ消す）は分けて数える。
 * route ファイルは GET 等しか export できないのでここに置く。
 */
import type { TenantAuditEvent } from "@/lib/audit/tenantLog";

export type PruneResult = {
  table: string;
  /** deleted: 行を消した / redacted: 行は残し一部の列を消した */
  kind: "deleted" | "redacted";
  /** 実際に処理できた行数（DB が返した行から数える） */
  count: number;
  /** テナント別の件数。tenant_id を持たない行は含まない（count との差が「テナント無し」） */
  byTenant: Record<string, number>;
};

/** 処理した行をテナントごとに数える（tenant_id の無い行は数えない）。 */
export function countByTenant(rows: Array<{ tenant_id?: string | null }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.tenant_id) out[r.tenant_id] = (out[r.tenant_id] ?? 0) + 1;
  return out;
}

type Breakdown = { deleted: Record<string, number>; redacted: Record<string, number> };

/** ルールごとの件数を、テナントごとの監査イベント（削除/秘匿化それぞれのテーブル別件数つき）にまとめる。 */
export function buildRetentionAuditEvents(results: PruneResult[], runDate: string): TenantAuditEvent[] {
  const perTenant = new Map<string | null, Breakdown>();
  const add = (tenantId: string | null, r: PruneResult, n: number) => {
    if (n <= 0) return;
    const b = perTenant.get(tenantId) ?? { deleted: {}, redacted: {} };
    b[r.kind][r.table] = (b[r.kind][r.table] ?? 0) + n;
    perTenant.set(tenantId, b);
  };
  for (const r of results) {
    let tenanted = 0;
    for (const [tenantId, n] of Object.entries(r.byTenant)) {
      add(tenantId, r, n);
      tenanted += n;
    }
    add(null, r, r.count - tenanted);
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return [...perTenant].map(([tenantId, b]) => ({
    tenantId,
    actorType: "system",
    action: "data_retention_pruned",
    table: "data_retention",
    recordId: `data-retention:${runDate}`,
    extra: { ...b, total_deleted: sum(b.deleted), total_redacted: sum(b.redacted) },
  }));
}
