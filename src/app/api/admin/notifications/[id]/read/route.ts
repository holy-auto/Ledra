import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";

/**
 * PUT /api/admin/notifications/[id]/read
 * 通知を既読にする
 */
export async function PUT(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // 店舗宛（user_id IS NULL）と自分宛（user_id = 自分）だけを既読にできる。
    // read-all と一覧は元からこの絞りを持っていたが、ここだけ id + tenant_id しか
    // 見ておらず、**他人宛の個人通知を既読にできた**（同じ操作に入口が3つあるのに
    // 1本だけ絞りが抜けていた。MISTAKE_LEDGER 型 C）。
    // 本番の 62 件はすべて user_id が null なので、現時点で挙動は変わらない。
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .or(`user_id.is.null,user_id.eq.${caller.userId}`)
      .is("read_at", null);

    if (error) return apiInternalError(error, "mark notification read");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "mark notification read");
  }
}
