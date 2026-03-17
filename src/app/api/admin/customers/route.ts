import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { escapeIlike, escapePostgrestValue } from "@/lib/sanitize";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { customerCreateSchema, customerUpdateSchema, customerDeleteSchema } from "@/lib/validations/customer";

export const dynamic = "force-dynamic";

// ─── GET: 顧客一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const p = parsePagination(req);
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" })
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (q) {
      const sq = escapePostgrestValue(escapeIlike(q));
      query = query.or(`name.ilike.%${sq}%,email.ilike.%${sq}%,phone.ilike.%${sq}%,name_kana.ilike.%${sq}%`);
    }

    const { data: customers, error, count } = await query.range(p.from, p.to);
    if (error) return apiInternalError(error, "customers list query");

    // 各顧客の証明書数を取得
    const customerIds = (customers ?? []).map((c) => c.id);
    let certCounts: Record<string, number> = {};
    let invoiceCounts: Record<string, number> = {};

    if (customerIds.length > 0) {
      const { data: certs } = await supabase
        .from("certificates")
        .select("customer_id")
        .eq("tenant_id", caller.tenantId)
        .in("customer_id", customerIds);

      (certs ?? []).forEach((c) => {
        if (c.customer_id) {
          certCounts[c.customer_id] = (certCounts[c.customer_id] || 0) + 1;
        }
      });

      const { data: invs } = await supabase
        .from("invoices")
        .select("customer_id")
        .eq("tenant_id", caller.tenantId)
        .in("customer_id", customerIds);

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

    return NextResponse.json({
      customers: enriched,
      page: p.page,
      per_page: p.perPage,
      total: count ?? 0,
      stats: {
        total: count ?? 0,
        this_month_new: thisMonthNew,
        linked_certificates: totalCerts,
      },
    });
  } catch (e) {
    return apiInternalError(e, "customers list");
  }
}

// ─── POST: 顧客追加 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = customerCreateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(" ");
      return apiValidationError(msg);
    }

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      name: parsed.data.name,
      name_kana: parsed.data.name_kana ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      postal_code: parsed.data.postal_code ?? null,
      address: parsed.data.address ?? null,
      note: parsed.data.note ?? null,
    };

    const { data, error } = await supabase.from("customers").insert(row).select().single();
    if (error) return apiInternalError(error, "customer insert");

    return apiOk({ customer: data });
  } catch (e) {
    return apiInternalError(e, "customer create");
  }
}

// ─── PUT: 顧客更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = customerUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(" ");
      return apiValidationError(msg);
    }

    const updates: Record<string, unknown> = {
      name: parsed.data.name,
      name_kana: parsed.data.name_kana ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      postal_code: parsed.data.postal_code ?? null,
      address: parsed.data.address ?? null,
      note: parsed.data.note ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("customers")
      .update(updates)
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "customer update");

    return apiOk({ customer: data });
  } catch (e) {
    return apiInternalError(e, "customer update");
  }
}

// ─── DELETE: 顧客削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = customerDeleteSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map(i => i.message).join(" ");
      return apiValidationError(msg);
    }

    // リンク済み証明書/請求書があるか確認
    const { count: certCount } = await supabase
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", parsed.data.id);

    const { count: invCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", parsed.data.id);

    if ((certCount ?? 0) > 0 || (invCount ?? 0) > 0) {
      return apiValidationError("この顧客には証明書または請求書が紐付いているため削除できません。");
    }

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "customer delete");

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "customer delete");
  }
}
