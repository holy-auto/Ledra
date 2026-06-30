import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { parseThreadKey } from "@/lib/messages/threadKey";
import { linkLineUserToCustomer } from "@/lib/line/linkCustomer";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/messages/[key]/link
 *
 * 未紐付け (line_user_id だけ) の受信スレッドを顧客に紐付ける。
 *   - mode "existing": 既存顧客に line_user_id をセット
 *   - mode "new":      新規顧客を作成し line_user_id をセット
 *
 * 紐付け後、その line_user_id を持つ customer_id=NULL の customer_messages を
 * 一括で customer_id に backfill する (過去スレッドが顧客に集約される)。
 *
 * 壁3: 顧客 (本人) レコードの作成・紐付けは **スタッフの明示操作のみ**。
 * LINE 受信時の自動顧客作成は行わない (customer.auto_create は NEVER_AUTO のまま)。
 */

const linkSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    customer_id: z.string().uuid("顧客IDが不正です。"),
  }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1, "顧客名は必須です。").max(100),
    phone: z
      .string()
      .trim()
      .max(20)
      .nullable()
      .optional()
      .transform((v) => v || null),
  }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const ref = parseThreadKey(key);
    if (ref.kind !== "line") {
      // customer スレッドは既に紐付け済み。line スレッドだけが対象。
      return apiValidationError("このスレッドは紐付け対象ではありません (LINE 未紐付けスレッドのみ)。");
    }
    const lineUserId = ref.lineUserId;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 本人確認に関わる操作なので staff 以上。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = linkSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 既にこの line_user_id が別顧客に紐付いていないか確認 (二重紐付け防止)。
    const { data: already } = await admin
      .from("customers")
      .select("id, name")
      .eq("tenant_id", caller.tenantId)
      .eq("line_user_id", lineUserId)
      .limit(1)
      .maybeSingle();
    if (already) {
      return apiValidationError(`この LINE ユーザは既に顧客「${already.name ?? already.id}」に紐付いています。`);
    }

    let customerId: string;
    let customerName: string | null = null;

    if (parsed.data.mode === "existing") {
      // 対象顧客が存在し、まだ別の line_user_id を持っていないことを確認。
      const { data: target, error: tErr } = await admin
        .from("customers")
        .select("id, name, line_user_id")
        .eq("id", parsed.data.customer_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (tErr) return apiInternalError(tErr, "message link: customer fetch");
      if (!target) return apiNotFound("顧客が見つかりません。");
      if (target.line_user_id && target.line_user_id !== lineUserId) {
        return apiValidationError("この顧客には既に別の LINE ユーザが紐付いています。");
      }
      const { error: upErr } = await admin
        .from("customers")
        .update({ line_user_id: lineUserId, updated_at: new Date().toISOString() })
        .eq("id", target.id)
        .eq("tenant_id", caller.tenantId);
      if (upErr) return apiInternalError(upErr, "message link: customer update");
      customerId = target.id as string;
      customerName = (target.name as string | null) ?? null;
    } else {
      // 新規顧客作成 (スタッフ操作なので本人確認が成立)。
      const { data: created, error: cErr } = await admin
        .from("customers")
        .insert({
          id: crypto.randomUUID(),
          tenant_id: caller.tenantId,
          name: parsed.data.name,
          phone: parsed.data.phone,
          line_user_id: lineUserId,
        })
        .select("id, name")
        .single();
      if (cErr) return apiInternalError(cErr, "message link: customer create");
      customerId = created.id as string;
      customerName = (created.name as string | null) ?? null;
    }

    // この line_user_id の未紐付けメッセージを backfill し、過去履歴の予約候補化を enqueue する。
    // customers.line_user_id は上で既に更新済みなので setLineUserId=false。
    const linkResult = await linkLineUserToCustomer({
      tenantId: caller.tenantId,
      customerId,
      lineUserId,
      setLineUserId: false,
    });

    return apiJson({
      ok: true,
      customer_id: customerId,
      customer_name: customerName,
      thread_key: `c:${customerId}`,
      backfilled: linkResult.backfilled,
    });
  } catch (e) {
    return apiInternalError(e, "message link POST");
  }
}
