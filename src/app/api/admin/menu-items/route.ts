import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  menuItemCreateSchema,
  menuItemCsvImportSchema,
  menuItemDeleteSchema,
  menuItemUpdateSchema,
} from "@/lib/validations/menu-item";

export const dynamic = "force-dynamic";

// ─── GET: 品目一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";

    let query = supabase
      .from("menu_items")
      .select("id, name, description, unit_price, tax_category, is_active, sort_order, created_at")
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) {
      return apiInternalError(error, "menu-items list");
    }

    const res = NextResponse.json({
      items: data ?? [],
      stats: { total: data?.length ?? 0 },
    });
    res.headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=120");
    return res;
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items GET");
  }
}

// ─── POST: 品目作成 / CSV一括インポート ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    // CSV一括インポート
    if (body.action === "csv_import") {
      const csvParsed = menuItemCsvImportSchema.safeParse(body);
      if (!csvParsed.success) {
        return apiValidationError(csvParsed.error.issues[0]?.message ?? "invalid payload");
      }
      const lines = csvParsed.data.csv
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("品目名")); // ヘッダー行をスキップ

      const rows = lines
        .map((line) => {
          const parts = line.split(",").map((s) => s.trim());
          return {
            tenant_id: caller.tenantId,
            name: parts[0] || "",
            description: parts[1] || null,
            unit_price: parseInt(parts[2] || "0", 10) || 0,
            tax_category: parseInt(parts[3] || "10", 10) === 8 ? 8 : 10,
          };
        })
        .filter((r) => r.name);

      if (rows.length === 0) {
        return apiValidationError("有効な行がありません");
      }

      // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.from("menu_items").insert(rows).select("id");
      if (error) {
        return apiInternalError(error, "menu-items csv insert");
      }

      return NextResponse.json({ ok: true, imported: data?.length ?? 0 });
    }

    // 単一作成
    const parsed = menuItemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const row = {
      tenant_id: caller.tenantId,
      ...parsed.data,
    };

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("menu_items")
      .insert(row)
      .select("id, name, description, unit_price, tax_category, is_active, sort_order, created_at, updated_at")
      .single();
    if (error) {
      return apiInternalError(error, "menu-items insert");
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items POST");
  }
}

// ─── PUT: 品目更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = menuItemUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;
    const updates: Record<string, unknown> = { ...fields };

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, name, description, unit_price, tax_category, is_active, sort_order, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "menu-items update");
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items PUT");
  }
}

// ─── DELETE: 品目論理削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = menuItemDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

    // RLS をバイパスしてサービスロールで論理削除（tenant_id で必ずスコープ限定）
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("menu_items")
      .update({ is_active: false })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "menu-items delete");
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "menu-items DELETE");
  }
}
