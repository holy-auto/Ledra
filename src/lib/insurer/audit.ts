import { createClient } from "@/lib/supabase/server";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";

export type AuditAction = "view" | "search" | "download_pdf" | "export_csv";

export async function logInsurerAccess(params: {
  action: AuditAction;
  certificateId: string;
  meta?: Record<string, any>;
  ip?: string | null;
  userAgent?: string | null;
}) {
  const { action, certificateId, meta, ip, userAgent } = params;

  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Not authenticated");

  const { data: me, error: meErr } = await sb
    .from("insurer_users")
    .select("id, insurer_id")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (meErr) throw meErr;
  if (!me) throw new Error("Insurer user not found");

  const { admin } = createInsurerScopedAdmin(me.insurer_id);
  const { error: insErr } = await admin.from("insurer_access_logs").insert({
    insurer_id: me.insurer_id,
    insurer_user_id: me.id,
    certificate_id: certificateId,
    action,
    meta: meta ?? {},
    ip: ip ?? null,
    user_agent: userAgent ?? null,
  });

  if (insErr) throw insErr;
}
