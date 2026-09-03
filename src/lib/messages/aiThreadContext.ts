/**
 * 受信箱の AI 機能 (返信ドラフト / 会話要約) が共通で使うスレッド文脈のロード。
 *
 * スレッド (customer / line) から、表示名・店舗名・直近のやり取り・登録車両 (1台確定時のみ) を
 * まとめて解決する。ai-reply / ai-summary ルートで同じ解決ロジックを二重に持たないための単一情報源。
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import type { ThreadRef } from "@/lib/messages/threadKey";
import type { ReplyDraftTurn } from "@/lib/ai/replyDraft";

type Admin = ReturnType<typeof createTenantScopedAdmin>["admin"];

export interface AiThreadContext {
  customerId: string | null;
  lineUserId: string | null;
  customerName: string | null;
  shopName: string | null;
  /** 1台に確定できるときだけ設定 (複数台/0台は null)。 */
  vehicle: string | null;
  /** 直近のやり取り (古い順)。 */
  turns: ReplyDraftTurn[];
}

/**
 * customer / line スレッドの AI 文脈を解決する。customer スレッドで顧客が見つからなければ
 * `{ ok: false }` を返す (呼び出し側が 404 を返す)。email/invalid は呼び出し側で弾く前提。
 */
export async function loadAiThreadContext(
  admin: Admin,
  tenantId: string,
  ref: Extract<ThreadRef, { kind: "customer" | "line" }>,
  opts: { turnLimit: number },
): Promise<{ ok: true; ctx: AiThreadContext } | { ok: false }> {
  let customerId: string | null = null;
  let lineUserId: string | null = null;
  let customerName: string | null = null;

  if (ref.kind === "customer") {
    const { data: c } = await admin
      .from("customers")
      .select("id, name, line_user_id")
      .eq("id", ref.customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!c) return { ok: false };
    customerId = c.id as string;
    customerName = (c.name as string | null) ?? null;
    lineUserId = (c.line_user_id as string | null) ?? null;
  } else {
    lineUserId = ref.lineUserId;
    const { data: matched } = await admin
      .from("customers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("line_user_id", ref.lineUserId)
      .limit(1)
      .maybeSingle();
    if (matched) {
      customerId = matched.id as string;
      customerName = (matched.name as string | null) ?? null;
    }
  }

  // 直近メッセージ (customer_id / line_user_id いずれか、古い順)。
  const turns: ReplyDraftTurn[] = [];
  const col = customerId ? "customer_id" : "line_user_id";
  const val = customerId ?? lineUserId;
  if (val) {
    const { data } = await admin
      .from("customer_messages")
      .select("direction, body, created_at")
      .eq("tenant_id", tenantId)
      .eq(col, val)
      .order("created_at", { ascending: false })
      .limit(opts.turnLimit);
    for (const m of (data ?? []).reverse()) {
      turns.push({ direction: m.direction as "inbound" | "outbound", body: (m.body as string) ?? "" });
    }
  }

  // 店舗名 / 登録車両 (1台に確定できるときだけ)。
  const [tenantRes, vehicleRes] = await Promise.all([
    admin.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
    customerId
      ? admin.from("vehicles").select("maker, model").eq("tenant_id", tenantId).eq("customer_id", customerId).limit(2)
      : Promise.resolve({ data: [] }),
  ]);
  const vehicles = (vehicleRes.data as Array<{ maker: string | null; model: string | null }> | null) ?? [];
  const vehicle =
    vehicles.length === 1
      ? [vehicles[0].maker, vehicles[0].model].filter((s): s is string => !!s && s.trim().length > 0).join(" ") || null
      : null;

  return {
    ok: true,
    ctx: {
      customerId,
      lineUserId,
      customerName,
      shopName: (tenantRes.data?.name as string | null) ?? null,
      vehicle,
      turns,
    },
  };
}
