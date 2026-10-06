/**
 * 保持期限 cron（/api/cron/data-retention）の削除件数を、テナント別の監査イベントにまとめる。 [G2]
 *
 * cron は全テナント横断で消すが、`audit_logs.tenant_id` は NOT NULL なので横断の 1 行は残せない。
 * テナントごとに 1 行（テーブル別件数つき）にする。route ファイルは GET 等しか export できないのでここに置く。
 */
import type { TenantAuditEvent } from "@/lib/audit/tenantLog";

export type PruneResult = { table: string; deleted: number; byTenant: Record<string, number> };

/** 削除対象の行をテナントごとに数える（tenant_id の無い行は数えない）。 */
export function countByTenant(rows: Array<{ tenant_id?: string | null }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) if (r.tenant_id) out[r.tenant_id] = (out[r.tenant_id] ?? 0) + 1;
  return out;
}

/** ルールごとのテナント別件数を、テナントごとの監査イベント（テーブル別件数つき）にまとめる。 */
export function buildRetentionAuditEvents(results: PruneResult[], runDate: string): TenantAuditEvent[] {
  const perTenant = new Map<string, Record<string, number>>();
  for (const r of results) {
    for (const [tenantId, n] of Object.entries(r.byTenant)) {
      const b = perTenant.get(tenantId) ?? {};
      b[r.table] = (b[r.table] ?? 0) + n;
      perTenant.set(tenantId, b);
    }
  }
  return [...perTenant].map(([tenantId, breakdown]) => ({
    tenantId,
    actorType: "system",
    action: "data_retention_pruned",
    table: "data_retention",
    recordId: `data-retention:${runDate}`,
    extra: { breakdown, total: Object.values(breakdown).reduce((a, b) => a + b, 0) },
  }));
}
