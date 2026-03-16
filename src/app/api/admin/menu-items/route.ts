import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerBasic } from "@/lib/api/auth";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { menuItemCreateSchema, menuItemUpdateSchema, menuItemDeleteSchema, menuItemCsvImportSchema } from "@/lib/validations/menu-item";

export const dynamic = "force-dynamic";

// ─── GET: 品目一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const activeOnly = url.searchParams.get("active_only") !== "false";

    let query = supabase
      .from("menu_items")
      .select("*")
      .eq("tenant_id", caller.tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "menu items list");

    return NextResponse.json({
      items: data ?? [],
      stats: { total: data?.length ?? 0 },
    });
  } catch (e) {
    return apiInternalError(e, "menu items list");
  }
}

// ─── POST: 品目作成 / CSV一括インポート ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));

    // CSV一括インポート
    if (body.action === "csv_import") {
      const csvParsed = menuItemCsvImportSchema.safeParse(body);
      if (!csvParsed.success) {
        return apiValidationError(csvParsed.error.issues[0]?.message ?? "入力が無効です。");
      }

      const lines = csvParsed.data.csv
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith("品目名")); // ヘッダー行をスキップ

      const rows = lines.map((line: string) => {
        const parts = line.split(",").map((s: string) => s.trim());
        return {
          tenant_id: caller.tenantId,
          name: parts[0] || "",
          description: parts[1] || null,
          unit_price: parseInt(parts[2] || "0", 10) || 0,
          tax_category: parseInt(parts[3] || "10", 10) === 8 ? 8 : 10,
        };
      }).filter((r) => r.name);

      if (rows.length === 0) {
        return apiValidationError("有効な行がありません。");
      }

      const { data, error } = await supabase.from("menu_items").insert(rows).select();
      if (error) return apiInternalError(error, "menu items csv import");

      return apiOk({ imported: data?.length ?? 0 });
    }

    // 単一作成
    const parsed = menuItemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const row = {
      tenant_id: caller.tenantId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      unit_price: parsed.data.unit_price,
      tax_category: parsed.data.tax_category,
      sort_order: parsed.data.sort_order,
    };

    const { data, error } = await supabase.from("menu_items").insert(row).select().single();
    if (error) return apiInternalError(error, "menu item create");

    return apiOk({ item: data });
  } catch (e) {
    return apiInternalError(e, "menu item create");
  }
}

// ─── PUT: 品目更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = menuItemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const { id, ...updates } = parsed.data;

    const { data, error } = await supabase
      .from("menu_items")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return apiInternalError(error, "menu item update");

    return apiOk({ item: data });
  } catch (e) {
    return apiInternalError(e, "menu item update");
  }
}

// ─── DELETE: 品目論理削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerBasic(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = menuItemDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が無効です。");
    }

    const { error } = await supabase
      .from("menu_items")
      .update({ is_active: false })
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "menu item delete");

    return apiOk({});
  } catch (e) {
    return apiInternalError(e, "menu item delete");
  }
}
