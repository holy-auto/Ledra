import { createServiceRoleAdmin, createTenantScopedAdmin } from "@/lib/supabase/admin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { apiJson, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { inquiryCreateSchema } from "@/lib/validations/market";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

// ─── POST: Create inquiry (要ログイン・IP レート制限) ───
// **「public」ではない。** withCaller 統一（2026-09-16）で認証必須になった。
// 入口の `/market/[id]` も未ログインなら /login へ送るので、実際の導線と一致している。
// ロール権限は課さない（買い手側の操作。出品側の market:* を課すと送れなくなる）。
export const POST = withCaller(
  // caller は使わない（買い手の氏名・連絡先はフォームの入力、売り手は車両から引く）。
  async (req) => {
    try {
      // Rate limit: 5 inquiries per 15 minutes per IP
      const ip = getClientIp(req);
      const rl = await checkRateLimit(`market-inquiry:${ip}`, { limit: 5, windowSec: 900 });
      if (!rl.allowed) {
        return apiJson(
          { error: "rate_limited", message: "送信回数の上限に達しました。しばらくしてからお試しください。" },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
        );
      }

      // 売り手テナントは下の車両検索から引く（caller のテナントではない）ので、
      // この最初の問い合わせだけは解決前 = service-role で読む。
      const admin = createServiceRoleAdmin(
        "market public inquiry — seller tenant resolved from vehicle_id after lookup",
      );
      const parsed = inquiryCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { vehicle_id, buyer_name, buyer_email, message, buyer_company, buyer_phone } = parsed.data;

      // Look up the vehicle to get seller tenant_id。公開中(listed)の車両にのみ
      // 問い合わせを許可する(下書き/予約済/売却済の ID を直接叩く経路を塞ぐ)。
      const { data: vehicle, error: vErr } = await admin
        .from("market_vehicles")
        .select("tenant_id, status")
        .eq("id", vehicle_id)
        .eq("status", "listed")
        .single();

      if (vErr || !vehicle) {
        return apiNotFound("vehicle_not_found");
      }

      const row: Record<string, unknown> = {
        id: crypto.randomUUID(),
        vehicle_id,
        seller_tenant_id: vehicle.tenant_id,
        buyer_name,
        buyer_email,
        message,
        status: "new",
      };

      if (buyer_company) row.buyer_company = buyer_company;
      if (buyer_phone) row.buyer_phone = buyer_phone;

      const { data: inquiry, error } = await admin
        .from("market_inquiries")
        .insert(row)
        .select(
          "id, vehicle_id, seller_tenant_id, buyer_name, buyer_email, buyer_company, buyer_phone, message, status, created_at",
        )
        .single();

      if (error) {
        return apiInternalError(error, "market-inquiries insert");
      }

      return apiJson({ ok: true, inquiry });
    } catch (e: unknown) {
      return apiInternalError(e, "market-inquiries create");
    }
  },
  { routeName: "market/inquiries POST" },
);

// ─── GET: List inquiries for caller's tenant ───
export const GET = withCaller(
  async (req, { caller }) => {
    try {
      const { admin } = createTenantScopedAdmin(caller.tenantId);
      const url = new URL(req.url);
      const status = url.searchParams.get("status") ?? "";

      let query = admin
        .from("market_inquiries")
        .select("*, market_vehicles(maker, model)")
        .eq("seller_tenant_id", caller.tenantId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: inquiries, error } = await query;

      if (error) {
        return apiInternalError(error, "market-inquiries list");
      }

      return apiJson({ inquiries: inquiries ?? [] });
    } catch (e: unknown) {
      return apiInternalError(e, "market-inquiries list");
    }
  },
  { routeName: "market/inquiries GET" },
);
