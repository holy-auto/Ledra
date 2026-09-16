import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentTrainingCreateSchema } from "@/lib/validations/agent-content";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const admin = createPlatformScopedAdmin("agent-training — platform-wide agent operations (no tenant scope)");
      const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

      let query = admin
        .from("agent_training_courses")
        .select(
          "id, title, description, category, content_type, content_url, thumbnail_url, duration_min, is_required, is_published, sort_order, created_at, updated_at",
          { count: "exact" },
        )
        .order("sort_order", { ascending: true });

      if (p.page > 0) query = query.range(p.from, p.to);
      else query = query.limit(p.perPage);

      const { data, count } = await query;
      return apiJson({
        courses: data ?? [],
        page: p.page,
        per_page: p.perPage,
        total: count ?? null,
      });
    } catch (e) {
      return apiInternalError(e, "agent-training GET");
    }
  },
  { routeName: "agent-training GET" },
);

export const POST = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const parsed = await parseJsonBody(request, agentTrainingCreateSchema);
      if (!parsed.ok) return parsed.response;
      const body = parsed.data;
      const admin = createPlatformScopedAdmin("agent-training — platform-wide agent operations (no tenant scope)");

      const { data, error } = await admin
        .from("agent_training_courses")
        .insert({
          title: body.title,
          description: body.description ?? null,
          category: body.category ?? "basic",
          content_type: body.content_type ?? "video",
          content_url: body.content_url ?? null,
          thumbnail_url: body.thumbnail_url ?? null,
          duration_min: body.duration_min ?? null,
          is_required: body.is_required ?? false,
          is_published: body.is_published ?? true,
          sort_order: body.sort_order ?? 0,
        })
        .select(
          "id, title, description, category, content_type, content_url, thumbnail_url, duration_min, is_required, is_published, sort_order, created_at, updated_at",
        )
        .single();

      if (error) return apiInternalError(error, "agent-training POST");
      return apiJson({ course: data }, { status: 201 });
    } catch (e) {
      return apiInternalError(e, "agent-training POST");
    }
  },
  { routeName: "agent-training POST" },
);
