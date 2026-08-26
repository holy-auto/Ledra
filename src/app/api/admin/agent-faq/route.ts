import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentFaqCreateSchema } from "@/lib/validations/agent-content";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const p = parsePagination(request, { defaultPerPage: 100, maxPerPage: 500 });

    let faqQuery = admin
      .from("agent_faqs")
      .select(
        "id, category_id, question, answer, sort_order, is_published, created_at, updated_at, agent_faq_categories(name)",
        { count: "exact" },
      )
      .order("sort_order");

    if (p.page > 0) faqQuery = faqQuery.range(p.from, p.to);
    else faqQuery = faqQuery.limit(p.perPage);

    // Categories are reference data — never paginate; the list is small.
    const [catRes, faqRes] = await Promise.all([
      admin.from("agent_faq_categories").select("id, name, sort_order, created_at").order("sort_order"),
      faqQuery,
    ]);

    const faqs = (faqRes.data ?? []).map((f: any) => ({
      ...f,
      category_name: f.agent_faq_categories?.name ?? "",
      agent_faq_categories: undefined,
    }));

    return apiJson({
      categories: catRes.data ?? [],
      faqs,
      page: p.page,
      per_page: p.perPage,
      total: faqRes.count ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "agent-faq GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const parsed = await parseJsonBody(request, agentFaqCreateSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data, error } = await admin
      .from("agent_faqs")
      .insert({
        category_id: body.category_id,
        question: body.question,
        answer: body.answer,
        sort_order: body.sort_order ?? 0,
        is_published: body.is_published ?? true,
      })
      .select("id, category_id, question, answer, sort_order, is_published, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "agent-faq POST");
    return apiJson({ faq: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-faq POST");
  }
}
