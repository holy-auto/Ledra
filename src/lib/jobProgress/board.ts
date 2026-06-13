/**
 * 作業進捗ボード — サーバ側データ集約。
 *
 * 「請求書」は実テーブルではなく documents(doc_type='invoice') の VIEW
 * (20260323010000_unify_invoices_to_documents.sql)。本モジュールは実テーブル
 * documents を直接読み (VIEW の PostgREST 埋め込みに依存しない)、
 * 顧客 / 車両を id でバッチ解決してカード表示用に整形する。
 *
 * テナント境界: 呼び出し側で resolveCallerWithRole を済ませ tenantId を渡す。
 * createTenantScopedAdmin を使い全クエリを .eq("tenant_id", tenantId) で絞る。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { JOB_STATUSES, type JobStatus } from "@/lib/validations/job-progress";

/** 直近で引渡済みになった請求書も表示する遡及日数。 */
const DELIVERED_LOOKBACK_DAYS = 7;

export interface JobProgressCard {
  id: string;
  invoice_number: string | null;
  job_status: JobStatus;
  total: number;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_id: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  updated_at: string | null;
}

export interface JobProgressBoard {
  /** ステージ → カード配列 (順序保持) */
  columns: Record<JobStatus, JobProgressCard[]>;
  /** ステージ → 件数 */
  counts: Record<JobStatus, number>;
  total: number;
}

type DocumentRow = {
  id: string;
  doc_number: string | null;
  job_status: string | null;
  total: number | null;
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle_info_json: Record<string, unknown> | null;
  updated_at: string | null;
};

function emptyColumns(): Record<JobStatus, JobProgressCard[]> {
  const out = {} as Record<JobStatus, JobProgressCard[]>;
  for (const s of JOB_STATUSES) out[s] = [];
  return out;
}

function normalizeStatus(raw: string | null): JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as JobStatus) : "draft";
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * テナントの進捗ボードを構築する。
 *
 * 取得対象: doc_type='invoice' の documents のうち
 *   - job_status != 'delivered'  (進行中の全件)、または
 *   - job_status = 'delivered' かつ updated_at が直近 7 日以内
 */
export async function getJobProgressBoard(tenantId: string): Promise<JobProgressBoard> {
  const { admin } = createTenantScopedAdmin(tenantId);

  const lookback = new Date(Date.now() - DELIVERED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // job_status != 'delivered' OR (delivered かつ updated_at >= lookback)。
  // PostgREST の or() で表現する。
  const { data: rawDocs, error } = await admin
    .from("documents")
    .select("id, doc_number, job_status, total, customer_id, vehicle_id, vehicle_info_json, updated_at")
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .or(`job_status.neq.delivered,and(job_status.eq.delivered,updated_at.gte.${lookback})`)
    .order("updated_at", { ascending: false })
    .limit(1000)
    .returns<DocumentRow[]>();

  if (error) throw new Error(`getJobProgressBoard documents: ${error.message}`);
  const docs = rawDocs ?? [];

  // 顧客 / 車両を id でバッチ解決。
  const customerIds = [...new Set(docs.map((d) => d.customer_id).filter(Boolean))] as string[];
  const vehicleIds = [...new Set(docs.map((d) => d.vehicle_id).filter(Boolean))] as string[];

  const [customersRes, vehiclesRes] = await Promise.all([
    customerIds.length
      ? admin.from("customers").select("id, name").eq("tenant_id", tenantId).in("id", customerIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    vehicleIds.length
      ? admin.from("vehicles").select("id, maker, model, plate_display").eq("tenant_id", tenantId).in("id", vehicleIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; maker: string | null; model: string | null; plate_display: string | null }>,
        }),
  ]);

  const customerMap = new Map<string, { name: string | null }>();
  for (const c of (customersRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    customerMap.set(c.id, { name: c.name });
  }
  const vehicleMap = new Map<string, { maker: string | null; model: string | null; plate_display: string | null }>();
  for (const v of (vehiclesRes.data ?? []) as Array<{
    id: string;
    maker: string | null;
    model: string | null;
    plate_display: string | null;
  }>) {
    vehicleMap.set(v.id, { maker: v.maker, model: v.model, plate_display: v.plate_display });
  }

  const columns = emptyColumns();
  for (const d of docs) {
    const status = normalizeStatus(d.job_status);
    const vehicle = d.vehicle_id ? vehicleMap.get(d.vehicle_id) : null;
    // 車両マスタが無い場合は vehicle_info_json (帳票スナップショット) にフォールバック。
    const info = d.vehicle_info_json ?? {};
    const card: JobProgressCard = {
      id: d.id,
      invoice_number: d.doc_number,
      job_status: status,
      total: d.total ?? 0,
      customer_id: d.customer_id,
      customer_name: d.customer_id ? (customerMap.get(d.customer_id)?.name ?? null) : null,
      vehicle_id: d.vehicle_id,
      vehicle_maker: vehicle?.maker ?? str(info.maker),
      vehicle_model: vehicle?.model ?? str(info.model),
      vehicle_plate: vehicle?.plate_display ?? str(info.plate_display) ?? str(info.plate),
      updated_at: d.updated_at,
    };
    columns[status].push(card);
  }

  const counts = {} as Record<JobStatus, number>;
  let total = 0;
  for (const s of JOB_STATUSES) {
    counts[s] = columns[s].length;
    total += counts[s];
  }

  return { columns, counts, total };
}
