/**
 * 店舗向け: 提携可能な供給パートナー一覧 (ディレクトリ) + 提携 (tenant_supply_links) の管理。
 *
 * - GET:  active なパートナーの公開列 + 自店の提携状況を返す。
 *         supply_partners は owner 専用 RLS のため、店舗からは直接読めない。
 *         そこで service-role で「公開してよい列だけ」を読み出す
 *         (api鍵・notes・owner などの内部列は SELECT しない)。
 * - POST: パートナーと提携する / 解除する (tenant_supply_links の upsert / 無効化)。
 *         RLS (tsl_*_tenant + is_supply_partner_active) が tenant 境界を二重で守る。
 */

import { z } from "zod";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { apiJson, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const linkSchema = z.object({
  supply_partner_id: z.string().uuid("無効なパートナーIDです。"),
  enabled: z.boolean(),
});

// 店舗に見せてよいパートナー公開列だけを SELECT する (内部列は読まない)。
const PUBLIC_PARTNER_COLS = "id, name, contact_email, contact_phone, api_auth_type, integration_status, created_at";

export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {
      // active パートナーのディレクトリ (公開列のみ)。supply_partners は owner 専用 RLS の
      // ため、platform スコープのクライアントで読む。SELECT する列を公開列に限定し、
      // status='active' でフィルタすることで、内部列 (api鍵/notes/owner) も審査前の行も露出させない。
      const admin = createPlatformScopedAdmin(
        "admin/supply: active 供給パートナーの公開ディレクトリ (公開列のみ・platform スコープ)",
      );
      const { data: partners, error: pErr } = await admin
        .from("supply_partners")
        .select(PUBLIC_PARTNER_COLS)
        .eq("status", "active")
        .order("name");
      if (pErr) return apiInternalError(pErr, "supply partners directory");

      // 自店の提携状況 (RLS スコープ済みの anon クライアントで取得)。
      const { data: links, error: lErr } = await supabase
        .from("tenant_supply_links")
        .select("supply_partner_id, is_enabled, priority")
        .eq("tenant_id", caller.tenantId);
      if (lErr) return apiInternalError(lErr, "supply links list");

      const linkBy = new Map((links ?? []).map((l) => [l.supply_partner_id as string, l]));
      const result = (partners ?? []).map((p) => {
        const link = linkBy.get(p.id as string);
        return {
          ...p,
          linked: Boolean(link?.is_enabled),
        };
      });

      return apiJson({ ok: true, partners: result });
    } catch (e: unknown) {
      return apiInternalError(e, "supply partners GET");
    }
  },
  { routeName: "admin/supply/partners GET" },
);

export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {
      const parsed = await parseJsonBody(req, linkSchema);
      if (!parsed.ok) return parsed.response;
      const { supply_partner_id, enabled } = parsed.data;

      // upsert: 提携 ON/OFF。tenant_id は caller スコープ。RLS の WITH CHECK が
      // tenant 境界 + is_supply_partner_active(active 限定) を強制する。
      const { error } = await supabase.from("tenant_supply_links").upsert(
        {
          tenant_id: caller.tenantId,
          supply_partner_id,
          is_enabled: enabled,
        },
        { onConflict: "tenant_id,supply_partner_id" },
      );
      if (error) return apiInternalError(error, "supply link upsert");

      return apiJson({ ok: true });
    } catch (e: unknown) {
      return apiInternalError(e, "supply partners POST");
    }
  },
  { minRole: "admin", routeName: "admin/supply/partners POST" },
);
