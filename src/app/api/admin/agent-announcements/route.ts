import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentAnnouncementCreateSchema } from "@/lib/validations/agent-content";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

export const GET = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const admin = createPlatformScopedAdmin("agent-announcements — platform-wide agent operations (no tenant scope)");
      const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

      let query = admin
        .from("agent_announcements")
        .select("id, title, body, category, is_pinned, published_at, created_by, created_at, updated_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false });

      if (p.page > 0) {
        query = query.range(p.from, p.to);
      } else {
        query = query.limit(p.perPage);
      }

      const { data, error, count } = await query;
      if (error) return apiInternalError(error, "agent-announcements GET");
      return apiJson({
        announcements: data ?? [],
        page: p.page,
        per_page: p.perPage,
        total: count ?? null,
      });
    } catch (e) {
      return apiInternalError(e, "agent-announcements GET");
    }
  },
  { routeName: "agent-announcements GET" },
);

export const POST = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const parsed = await parseJsonBody(request, agentAnnouncementCreateSchema);
      if (!parsed.ok) return parsed.response;
      const body = parsed.data;
      const admin = createPlatformScopedAdmin("agent-announcements — platform-wide agent operations (no tenant scope)");

      const { data, error } = await admin
        .from("agent_announcements")
        .insert({
          title: body.title,
          body: body.body,
          category: body.category,
          is_pinned: body.is_pinned,
          published_at: body.published_at ?? new Date().toISOString(),
          created_by: caller.userId,
        })
        .select("id, title, body, category, is_pinned, published_at, created_by, created_at, updated_at")
        .single();

      if (error) return apiInternalError(error, "agent-announcements POST");
      return apiJson({ announcement: data }, { status: 201 });
    } catch (e) {
      return apiInternalError(e, "agent-announcements POST");
    }
  },
  { routeName: "agent-announcements POST" },
);
