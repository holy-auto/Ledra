/**
 * 監査 findings 一覧のクエリ解析（純関数）。
 *
 * 設計: docs/parts-installation-integrity-design.md §4 L7（抜き取り監査）
 */

export interface FindingsQuery {
  status: "open" | "acknowledged" | "resolved" | "dismissed" | null;
  severity: "info" | "warning" | "critical" | null;
  installationId: string | null;
  limit: number;
}

const STATUSES = ["open", "acknowledged", "resolved", "dismissed"] as const;
const SEVERITIES = ["info", "warning", "critical"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFindingsQuery(params: URLSearchParams): FindingsQuery {
  const status = params.get("status");
  const severity = params.get("severity");
  const installationId = params.get("installation_id");
  const limitRaw = Number(params.get("limit"));

  return {
    status: (STATUSES as readonly string[]).includes(status ?? "") ? (status as FindingsQuery["status"]) : null,
    severity: (SEVERITIES as readonly string[]).includes(severity ?? "")
      ? (severity as FindingsQuery["severity"])
      : null,
    installationId: installationId && UUID_RE.test(installationId) ? installationId : null,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? Math.floor(limitRaw) : 100,
  };
}
