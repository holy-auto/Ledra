import { NextRequest } from "next/server";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentMaterialPersonalizeSchema } from "@/lib/validations/agent-portal";
import { AgentProposalCover } from "@/lib/pdf/AgentProposalCover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type TemplateField = {
  key: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
};

/**
 * POST /api/agent/materials/[id]/personalize
 *
 * Generates a personalized A4 cover sheet (提案表紙) for a material that has
 * `has_template = true`, using the agent-supplied 会社名 / 担当者名 / 提案日 /
 * メモ. Returns the rendered cover as an inline PDF download — the agent
 * prepends it (manually) to the shared material before sending to a customer.
 *
 * Auth mirrors the download route (Supabase session + active agent
 * membership). Required template fields are validated against the row's
 * `template_fields` so the generated cover never has empty mandatory values
 * even if a client bypasses the form.
 */
export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    // Verify agent membership; agent_name comes straight off the RPC.
    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
    if (!agentRow?.agent_id) {
      return apiForbidden("not_agent");
    }

    const parsed = await parseJsonBody(request, agentMaterialPersonalizeSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    // Fetch material (RLS restricts to published rows for agents)
    const { data: material, error: matErr } = await supabase
      .from("agent_materials")
      .select("id, title, has_template, template_fields")
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (matErr || !material) {
      return apiNotFound("material_not_found");
    }

    if (!material.has_template) {
      return apiValidationError("この資料は表紙作成に対応していません。");
    }

    // Enforce required fields declared by the material's template definition.
    const fields: TemplateField[] = Array.isArray(material.template_fields)
      ? (material.template_fields as TemplateField[])
      : [];
    const values: Record<string, string | undefined> = {
      company_name: body.company_name,
      contact_name: body.contact_name,
      proposal_date: body.proposal_date,
      memo: body.memo,
    };
    for (const field of fields) {
      if (field.required && !values[field.key]?.trim()) {
        return apiValidationError(`${field.label}は必須です。`);
      }
    }

    // agent_name is on the RPC result; fall back to the agents table only if
    // it is somehow absent so the cover footer is never blank.
    let agentName: string = agentRow.agent_name ?? "";
    if (!agentName) {
      const { data: agent } = await supabase.from("agents").select("name").eq("id", agentRow.agent_id).single();
      agentName = agent?.name ?? "";
    }

    // AgentProposalCover returns a <Document>, but React.createElement types the
    // element by its props, not its return — narrow to ReactElement<DocumentProps>
    // so renderToBuffer accepts it (same pattern as /api/insurer/pdf-one).
    const coverEl = React.createElement(AgentProposalCover, {
      data: {
        materialTitle: material.title,
        companyName: body.company_name,
        contactName: body.contact_name,
        proposalDate: body.proposal_date,
        agentName,
        memo: body.memo,
      },
    }) as unknown as React.ReactElement<DocumentProps>;

    const buffer = await renderToBuffer(coverEl);

    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cover_${material.id}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (e) {
    return apiInternalError(e, "agent/materials/[id]/personalize POST");
  }
}
