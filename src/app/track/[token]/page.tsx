import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { BODY_REPAIR_STAGES, BODY_REPAIR_STAGE_LABEL, type BodyRepairStage } from "@/lib/validations/body-repair-job";
import RaiseConcernButton from "@/components/customer/RaiseConcernButton";

export const metadata: Metadata = {
  title: "車体整備 進捗状況 | Ledra",
  description: "お預かりしているお車の車体整備の進捗状況をご確認いただけます。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

const STAGE_TS: Record<BodyRepairStage, string> = {
  intake: "intake_at",
  estimate: "estimate_at",
  bodywork: "bodywork_start_at",
  paint: "paint_start_at",
  complete: "complete_at",
  delivered: "delivered_at",
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
}

export default async function TrackPage({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const supabase = createServiceRoleAdmin(
    "body-repair progress tracking — opaque token lookup for customer (no login)",
  );

  const { data: job } = await supabase
    .from("body_repair_jobs")
    .select(
      `
      id, stage, planned_work_json, estimate_amount,
      intake_at, estimate_at, bodywork_start_at, paint_start_at, complete_at, delivered_at,
      tenant:tenants ( name ),
      vehicle:vehicles ( maker, model, plate_display )
    `,
    )
    .eq("track_token", token)
    .maybeSingle();

  if (!job) notFound();

  const tenant = (Array.isArray(job.tenant) ? job.tenant[0] : job.tenant) as { name: string | null } | null;
  const vehicle = (Array.isArray(job.vehicle) ? job.vehicle[0] : job.vehicle) as {
    maker: string | null;
    model: string | null;
    plate_display: string | null;
  } | null;
  const planned = (job.planned_work_json ?? {}) as { methods?: string };
  const currentIdx = BODY_REPAIR_STAGES.indexOf(job.stage as BodyRepairStage);
  const jobRec = job as unknown as Record<string, string | null>;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#666", fontSize: 13, margin: 0 }}>{tenant?.name ?? "車体整備"}</p>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "2px 0 16px" }}>車体整備 進捗状況</h1>

      <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 14 }}>
        {vehicle && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: "#888" }}>車両: </span>
            {[vehicle.maker, vehicle.model, vehicle.plate_display].filter(Boolean).join(" ") || "—"}
          </div>
        )}
        {planned.methods && (
          <div>
            <span style={{ color: "#888" }}>作業予定: </span>
            {planned.methods}
          </div>
        )}
        {job.estimate_amount != null && (
          <div>
            <span style={{ color: "#888" }}>概算見積: </span>¥{Number(job.estimate_amount).toLocaleString("ja-JP")}
          </div>
        )}
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {BODY_REPAIR_STAGES.map((stage, i) => {
          const done = i <= currentIdx;
          const isCurrent = i === currentIdx;
          const ts = fmt(jobRec[STAGE_TS[stage]] ?? null);
          return (
            <li key={stage} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0" }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: done ? "#0071e3" : "#e5e5e5",
                  color: done ? "#fff" : "#999",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <div>
                <div style={{ fontWeight: isCurrent ? 700 : 500, color: done ? "#111" : "#999" }}>
                  {BODY_REPAIR_STAGE_LABEL[stage]}
                  {isCurrent && <span style={{ marginLeft: 8, fontSize: 12, color: "#0071e3" }}>現在</span>}
                </div>
                {ts && <div style={{ fontSize: 12, color: "#888" }}>{ts}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      {/* IMP-026: 気になる点を伝える */}
      <div style={{ marginTop: 20 }}>
        <RaiseConcernButton sourceType="body_repair_tracking" sourceToken={token} variant="light" />
      </div>

      <p style={{ fontSize: 12, color: "#999", marginTop: 20 }}>
        進捗は施工店の作業に応じて更新されます。ご不明点は施工店までお問い合わせください。
      </p>
    </div>
  );
}
