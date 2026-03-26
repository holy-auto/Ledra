import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

// GET: Return all equipment items (system presets + tenant-specific), grouped by category
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { data, error } = await supabase
      .from("equipment_master")
      .select("id, tenant_id, category, name, sort_order")
      .eq("is_active", true)
      .or(`tenant_id.is.null,tenant_id.eq.${caller.tenantId}`)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    // Group by category
    const grouped: Record<string, { name: string; isCustom: boolean }[]> = {};
    for (const item of data ?? []) {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push({
        name: item.name,
        isCustom: item.tenant_id !== null,
      });
    }

    return apiOk({ equipment: grouped });
  } catch (e) {
    return apiInternalError(e, "equipment-master GET");
  }
}

// POST: Add a tenant-specific custom equipment item
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json();
    const { category, name } = body;

    if (!category || !name) {
      return apiValidationError("category と name は必須です。");
    }

    const trimmedName = String(name).trim();
    const trimmedCategory = String(category).trim();
    if (!trimmedName || !trimmedCategory) {
      return apiValidationError("category と name は空にできません。");
    }

    const { data, error } = await supabase
      .from("equipment_master")
      .insert({
        tenant_id: caller.tenantId,
        category: trimmedCategory,
        name: trimmedName,
      })
      .select("id, category, name")
      .single();

    if (error) {
      // Unique constraint violation
      if (error.code === "23505") {
        return apiValidationError("この装備は既に登録されています。");
      }
      throw error;
    }

    return apiOk({ item: data }, 201);
  } catch (e) {
    return apiInternalError(e, "equipment-master POST");
  }
}
