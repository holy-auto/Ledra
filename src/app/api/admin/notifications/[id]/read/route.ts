

import { apiJson, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
/**
 * PUT /api/admin/notifications/[id]/read
 * 通知を既読にする
 */
export const PUT = withCaller<{ id: string }>(
  async (_req, { caller, supabase, params }) => {
    try {
      const { id } = params;

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
  },
  { routeName: "mark notification read" },
);
