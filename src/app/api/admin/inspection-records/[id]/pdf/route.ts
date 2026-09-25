import { NextResponse } from "next/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiValidationError, apiInternalError } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";
import { renderIndicatedInspectionPdf, type IndicatedMeasurement } from "@/lib/pdf/pdfIndicatedInspection";
import { INDICATED_INSPECTION_FORMS, type IndicatedInspectionForm } from "@/lib/validations/indicated-inspection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 指定整備記録簿（完成検査）測定記録の PDF 出力。 [G5 / Phase 1c]
 *
 *   GET /api/admin/inspection-records/:id/pdf
 *
 * :id が自テナントの完成検査(inspection_type='completion')であることを検証し、測定値を
 * 第三号/四号様式のセル順で帳票化して application/pdf を返す。様式の別は作成時に
 * answers.__indicated_form へ保存した値を使い、無ければ第三号（四輪）を既定とする。
 */

const RECORD_COLUMNS = `
  id, inspection_type, inspector_name, inspected_at, notes, answers,
  vehicle:vehicles ( maker, model, plate_display ),
  customer:customers ( name )
`;

/** answers.__indicated_form.value を安全に読み取る。未知/未保存は sanago 既定。 */
function resolveForm(answers: unknown): IndicatedInspectionForm {
  const v = (answers as { __indicated_form?: { value?: unknown } } | null)?.__indicated_form?.value;
  return INDICATED_INSPECTION_FORMS.includes(v as IndicatedInspectionForm) ? (v as IndicatedInspectionForm) : "sanago";
}

export const GET = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    try {
      const { id } = params;
      const { admin } = createTenantScopedAdmin(caller.tenantId);

      const { data: record, error: recErr } = await admin
        .from("inspection_records")
        .select(RECORD_COLUMNS)
        .eq("tenant_id", caller.tenantId)
        .eq("id", id)
        .maybeSingle();
      if (recErr) return apiInternalError(recErr, "inspection-record pdf record");
      if (!record) return apiValidationError("対象の点検記録が見つかりません。");
      if ((record as { inspection_type: string }).inspection_type !== "completion") {
        return apiValidationError("完成検査以外の記録は本様式で出力できません。");
      }

      const { data: measurements, error: mErr } = await admin
        .from("inspection_measurements")
        .select("field_code, num_value, text_value, unit, judgment")
        .eq("tenant_id", caller.tenantId)
        .eq("inspection_record_id", id);
      if (mErr) return apiInternalError(mErr, "inspection-record pdf measurements");

      const { data: tenant } = await admin
        .from("tenants")
        .select("name, address, registration_number")
        .eq("id", caller.tenantId)
        .maybeSingle();

      const rec = record as unknown as {
        inspector_name: string | null;
        inspected_at: string | null;
        notes: string | null;
        answers: unknown;
        vehicle: { maker: string | null; model: string | null; plate_display: string | null } | null;
        customer: { name: string | null } | null;
      };

      const pdf = await renderIndicatedInspectionPdf({
        form: resolveForm(rec.answers),
        facility: {
          name: (tenant as { name?: string | null } | null)?.name ?? null,
          address: (tenant as { address?: string | null } | null)?.address ?? null,
          registrationNumber: (tenant as { registration_number?: string | null } | null)?.registration_number ?? null,
        },
        inspectorName: rec.inspector_name,
        inspectedAt: rec.inspected_at,
        vehicle: rec.vehicle
          ? { maker: rec.vehicle.maker, model: rec.vehicle.model, plate: rec.vehicle.plate_display }
          : null,
        customerName: rec.customer?.name ?? null,
        notes: rec.notes,
        measurements: (measurements ?? []) as IndicatedMeasurement[],
        generatedAt: new Date().toISOString(),
      });

      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `inline; filename="indicated-inspection-${id}.pdf"`,
        },
      });
    } catch (e) {
      return apiInternalError(e, "inspection-record pdf GET");
    }
  },
  { routeName: "inspection-record pdf GET" },
);
