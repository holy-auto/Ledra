import { z } from "zod";

import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
const equipmentMasterCreateSchema = z.object({
  category: z.string().trim().min(1, "category は必須です。").max(100),
  name: z.string().trim().min(1, "name は必須です。").max(200),
});

export const dynamic = "force-dynamic";

// GET: Return all equipment items (system presets + tenant-specific), grouped by category
export const GET = withCaller(
  async (_req, { caller, supabase }) => {
    try {
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
  },
  { routeName: "equipment-master GET" },
);

// POST: Add a tenant-specific custom equipment item
export const POST = withCaller(
  async (req, { caller, supabase }) => {
    try {
      // 設備マスタの変更は admin 以上 (代表判断 2026-09-01)

      const parsed = equipmentMasterCreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const { category, name } = parsed.data;

      const { data, error } = await supabase
        .from("equipment_master")
        .insert({
          tenant_id: caller.tenantId,
          category,
          name,
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
  },
  { permission: "settings:edit", routeName: "equipment-master POST" },
);
