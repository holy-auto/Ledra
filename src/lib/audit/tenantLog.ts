/**
 * テナント側の操作を `audit_logs` に記録する。
 *
 * なぜこの関数が要るか:
 * `audit_logs` の実際の列は `actor_type / actor_user_id / action /
 * target_public_id / query_json / ip / user_agent` だが、テナント側の6箇所は
 * `table_name / record_id / performed_by / ip_address` という**存在しない列**へ
 * 書いていた。supabase-js の insert はエラーを投げず戻り値に入れるだけで、
 * どの呼び出し元も戻り値を見ていなかったため、**証明書の有効化・取消、NFC の
 * 紐付け・書き込み、レジ締め、証明書の訂正の監査ログが1件も残っていなかった**
 * （実 DB の audit_logs 349 行はすべて actor_type='insurer'、つまり保険会社側の
 * RPC 経由の記録だけ）。
 *
 * 形を1箇所に集約して、呼び出し元ごとに列名がずれないようにする。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestMeta } from "./certificateLog";

/** actor_type は CHECK 制約で 'tenant' | 'insurer' | 'system' に限られる */
type ActorType = "tenant" | "system";

export interface TenantAuditEvent {
  tenantId: string;
  /** 操作した利用者。cron など人がいない経路では null */
  userId?: string | null;
  /** 例: "certificate_activated"。既存行に合わせて動詞の過去形で書く */
  action: string;
  /** 対象のテーブル名。実列が無いので query_json に入る */
  table: string;
  /** 対象の主キー。実列が無いので query_json に入る */
  recordId: string;
  /** 証明書など公開 ID があるものだけ。保険会社側の行と同じ意味で使う */
  targetPublicId?: string | null;
  /** 変更前後など、残しておきたい付随情報 */
  extra?: Record<string, unknown>;
  actorType?: ActorType;
  req?: Request;
}

export async function logTenantAuditEvent(db: Pick<SupabaseClient, "from">, e: TenantAuditEvent): Promise<void> {
  const meta = e.req ? getRequestMeta(e.req) : { ip: null, userAgent: null };
  const { error } = await db.from("audit_logs").insert({
    tenant_id: e.tenantId,
    actor_type: e.actorType ?? "tenant",
    actor_user_id: e.userId ?? null,
    action: e.action,
    target_public_id: e.targetPublicId ?? null,
    query_json: { table: e.table, record_id: e.recordId, ...(e.extra ?? {}) },
    ip: meta.ip,
    user_agent: meta.userAgent,
  });
  // 監査ログの失敗で本体の操作は止めない（操作はすでに終わっている）。
  // ただし黙って捨てない —— 捨てていたせいで6箇所の不具合が見えていなかった
  if (error) console.error(`[audit] audit_logs insert failed (${e.action}):`, error.message);
}
