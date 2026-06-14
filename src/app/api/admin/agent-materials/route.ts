import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import {
  MATERIALS_BUCKET,
  MAX_MATERIAL_SIZE,
  isAllowedMaterialType,
  isValidMaterialPath,
  materialStoragePath,
} from "./storage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

    let materialsQuery = admin
      .from("agent_materials")
      .select(
        "id, category_id, title, description, file_name, file_size, file_type, storage_path, version, is_pinned, is_published, uploaded_by, created_at, updated_at, agent_material_categories(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (p.page > 0) materialsQuery = materialsQuery.range(p.from, p.to);
    else materialsQuery = materialsQuery.limit(p.perPage);

    // Categories are reference data — never paginate; the list is small.
    const [catResult, matResult] = await Promise.all([
      admin
        .from("agent_material_categories")
        .select("id, name, slug, sort_order, created_at")
        .order("sort_order", { ascending: true }),
      materialsQuery,
    ]);

    const materials = (matResult.data ?? []).map((m: any) => ({
      ...m,
      category_name: m.agent_material_categories?.name ?? "",
      agent_material_categories: undefined,
    }));

    return apiJson({
      categories: catResult.data ?? [],
      materials,
      page: p.page,
      per_page: p.perPage,
      total: matResult.count ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "agent-materials GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Two upload paths:
    //  1. JSON metadata — the browser already uploaded the file directly to
    //     Storage via a signed upload URL (see ./upload-url). This avoids the
    //     hosting platform's ~4.5MB request body limit (HTTP 413) for large
    //     decks / PDFs.
    //  2. multipart/form-data — legacy path; the file streams through this
    //     handler. Kept for small files / backward compatibility.
    const contentType = request.headers.get("content-type") ?? "";

    let title: string | null;
    let categoryId: string | null;
    let description: string | null;
    let version: string | null;
    let isPinned: boolean;
    let fileName: string;
    let fileSize: number;
    let fileType: string;
    let storagePath: string;

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      title = typeof body?.title === "string" ? body.title : null;
      categoryId = typeof body?.category_id === "string" ? body.category_id : null;
      description = typeof body?.description === "string" ? body.description : null;
      version = typeof body?.version === "string" ? body.version : null;
      isPinned = body?.is_pinned === true || body?.is_pinned === "true";
      fileName = typeof body?.file_name === "string" ? body.file_name : "";
      fileSize = typeof body?.file_size === "number" ? body.file_size : NaN;
      fileType = typeof body?.file_type === "string" ? body.file_type : "";
      storagePath = typeof body?.storage_path === "string" ? body.storage_path : "";

      if (!title || !categoryId || !fileName || !storagePath) {
        return apiValidationError("title, category_id, file_name, and storage_path are required");
      }
      if (!isValidMaterialPath(storagePath)) {
        return apiValidationError("invalid storage_path");
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return apiValidationError("file_size is required");
      }
      if (fileSize > MAX_MATERIAL_SIZE) {
        return apiValidationError(
          `ファイルサイズは ${Math.floor(MAX_MATERIAL_SIZE / (1024 * 1024))}MB 以下にしてください。`,
        );
      }
      if (!isAllowedMaterialType(fileType, fileName)) {
        return apiValidationError("このファイル形式はアップロードできません。");
      }

      // The client controls storage_path; confirm the object was actually
      // uploaded (createSignedUrl errors for non-existent objects) so a caller
      // cannot register a record pointing at an arbitrary / missing path.
      const { error: existsErr } = await admin.storage.from(MATERIALS_BUCKET).createSignedUrl(storagePath, 60);
      if (existsErr) {
        return apiValidationError("アップロードされたファイルが見つかりません。再度お試しください。");
      }
    } else {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      title = formData.get("title") as string | null;
      categoryId = formData.get("category_id") as string | null;
      description = formData.get("description") as string | null;
      version = formData.get("version") as string | null;
      isPinned = formData.get("is_pinned") === "true";

      if (!file || !title || !categoryId) {
        return apiValidationError("file, title, and category_id are required");
      }

      storagePath = materialStoragePath(file.name);
      fileName = file.name;
      fileSize = file.size;
      fileType = file.type;

      const { error: uploadErr } = await admin.storage.from(MATERIALS_BUCKET).upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

      if (uploadErr) {
        return apiInternalError(uploadErr, "agent-materials upload");
      }
    }

    // Insert record
    const { data: material, error: insertErr } = await admin
      .from("agent_materials")
      .insert({
        category_id: categoryId,
        title,
        description: description || null,
        file_name: fileName,
        file_size: fileSize,
        file_type: fileType,
        storage_path: storagePath,
        version: version || null,
        is_pinned: isPinned,
        is_published: true,
        uploaded_by: caller.userId,
      })
      .select(
        "id, category_id, title, description, file_name, file_size, file_type, storage_path, version, is_pinned, is_published, uploaded_by, created_at, updated_at",
      )
      .single();

    if (insertErr) {
      return apiInternalError(insertErr, "agent-materials insert");
    }

    return apiJson({ material }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-materials POST");
  }
}
