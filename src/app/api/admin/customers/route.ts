import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { escapeIlike } from "@/lib/sanitize";
import { enforceBilling } from "@/lib/billing/guard";
import { parsePagination } from "@/lib/api/pagination";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: 顧客一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const { page, perPage, from, to } = parsePagination(req, { maxPerPage: 200 });

    // Count query for pagination metadata
    let countQuery = supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    let query = supabase
      .from("customers")
      // tenant_id は `.eq("tenant_id", caller.tenantId)` でフィルタするのみ。
      // caller は既に自テナント下で認証されているので response body に
      // 含める必要はなく、外す (see `redactScopeIds`).
      .select("id, name, name_kana, email, phone, postal_code, address, note, created_at, updated_at")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (q) {
      const sq = escapeIlike(q);
      const filter = `name.ilike.%${sq}%,email.ilike.%${sq}%,phone.ilike.%${sq}%,name_kana.ilike.%${sq}%`;
      query = query.or(filter);
      countQuery = countQuery.or(filter);
    }

    // Apply pagination if page param is provided
    if (page > 0) {
      query = query.range(from, to);
    }

    const [{ data: customers, error }, { count: totalCount }] = await Promise.all([query, countQuery]);
    if (error) {
      return apiInternalError(error, "customers GET");
    }

    // 各顧客の証明書数・請求書数を並列で取得（customer_idのみselectしてカウント）
    const customerIds = (customers ?? []).map((c) => c.id);
    let certCounts: Record<string, number> = {};
    let invoiceCounts: Record<string, number> = {};

    if (customerIds.length > 0) {
      const [{ data: certs }, { data: invs }] = await Promise.all([
        supabase
          .from("certificates")
          .select("customer_id", { count: "planned" })
          .eq("tenant_id", caller.tenantId)
          .in("customer_id", customerIds),
        supabase
          .from("documents")
          .select("customer_id", { count: "planned" })
          .eq("tenant_id", caller.tenantId)
          .in("doc_type", ["invoice", "consolidated_invoice"])
          .in("customer_id", customerIds),
      ]);

      (certs ?? []).forEach((c) => {
        if (c.customer_id) {
          certCounts[c.customer_id] = (certCounts[c.customer_id] || 0) + 1;
        }
      });

      (invs ?? []).forEach((inv) => {
        if (inv.customer_id) {
          invoiceCounts[inv.customer_id] = (invoiceCounts[inv.customer_id] || 0) + 1;
        }
      });
    }

    const enriched = (customers ?? []).map((c) => ({
      ...c,
      certificates_count: certCounts[c.id] || 0,
      invoices_count: invoiceCounts[c.id] || 0,
    }));

    // 統計
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thisMonthNew = enriched.filter((c) => c.created_at >= thisMonthStart).length;
    const totalCerts = Object.values(certCounts).reduce((a, b) => a + b, 0);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        customers: enriched,
        stats: {
          total: totalCount ?? enriched.length,
          this_month_new: thisMonthNew,
          linked_certificates: totalCerts,
        },
        ...(page > 0 && {
          pagination: {
            page,
            per_page: perPage,
            total: totalCount ?? enriched.length,
            total_pages: Math.ceil((totalCount ?? enriched.length) / perPage),
          },
        }),
      },
      { headers },
    );
  } catch (e) {
    return apiInternalError(e, "customers GET");
  }
}

// ─── POST: 顧客追加 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req as any, {
      minPlan: "free",
      action: "customer_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({}) as any);
    const name = (body?.name ?? "").trim();
    if (!name) return apiValidationError("顧客名は必須です。");

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      name,
      name_kana: (body?.name_kana ?? "").trim() || null,
      email: (body?.email ?? "").trim() || null,
      phone: (body?.phone ?? "").trim() || null,
      postal_code: (body?.postal_code ?? "").trim() || null,
      address: (body?.address ?? "").trim() || null,
      note: (body?.note ?? "").trim() || null,
    };

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customers")
      .insert(row)
      .select("id, tenant_id, name, name_kana, email, phone, postal_code, address, note, created_at, updated_at")
      .single();
    if (error) {
      return apiInternalError(error, "customers POST");
    }

    return apiJson({ ok: true, customer: data });
  } catch (e) {
    return apiInternalError(e, "customers POST");
  }
}

// ─── PUT: 顧客更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req as any, {
      minPlan: "free",
      action: "customer_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({}) as any);
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("id is required");

    const name = (body?.name ?? "").trim();
    if (!name) return apiValidationError("顧客名は必須です。");

    const updates: Record<string, unknown> = {
      name,
      name_kana: (body?.name_kana ?? "").trim() || null,
      email: (body?.email ?? "").trim() || null,
      phone: (body?.phone ?? "").trim() || null,
      postal_code: (body?.postal_code ?? "").trim() || null,
      address: (body?.address ?? "").trim() || null,
      note: (body?.note ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    };

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customers")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, tenant_id, name, name_kana, email, phone, postal_code, address, note, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "customers PUT");
    }

    // 双方向反映: 紐付き車両の updated_at も同期更新
    try {
      const { count } = await admin
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", id)
        .eq("tenant_id", caller.tenantId);

      if (count && count > 0) {
        await admin
          .from("vehicles")
          .update({ updated_at: new Date().toISOString() })
          .eq("customer_id", id)
          .eq("tenant_id", caller.tenantId);
      }
    } catch (syncErr) {
      // 同期失敗はログのみ（顧客更新自体は成功扱い）
      console.warn("[customers] vehicle sync warning:", syncErr);
    }

    return apiJson({ ok: true, customer: data });
  } catch (e) {
    return apiInternalError(e, "customers PUT");
  }
}

// ─── DELETE: 顧客削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req as any, {
      minPlan: "free",
      action: "customer_delete",
      tenantId: caller.tenantId,
    });
    if (deny) return deny as any;

    const body = await req.json().catch(() => ({}) as any);
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("id is required");

    // RLS をバイパスしてサービスロールで操作（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // リンク済み証明書/請求書があるか確認（並列実行）
    const [{ count: certCount }, { count: invCount }] = await Promise.all([
      admin
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", id),
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .in("doc_type", ["invoice", "consolidated_invoice"])
        .eq("customer_id", id),
    ]);

    if ((certCount ?? 0) > 0 || (invCount ?? 0) > 0) {
      return apiValidationError("この顧客には証明書または請求書が紐付いているため削除できません。");
    }

    const { error } = await admin.from("customers").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "customers DELETE");
    }

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "customers DELETE");
  }
}
