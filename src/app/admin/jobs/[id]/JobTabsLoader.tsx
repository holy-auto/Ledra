import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import JobWorkflowModeSwitch from "./JobWorkflowModeSwitch";
import type { JobReservation, JobCustomer, JobVehicle, JobCertificate, JobDocument } from "./types";

/**
 * JobTabsLoader
 * ------------------------------------------------------------
 * 証明書 (certificates) と書類 (documents) を並列取得し、
 * モード別ビュー (管理 = タブ / 店頭 = 大ボタン) を描画する
 * async Server Component。
 *
 * page.tsx からは <Suspense> で包んで呼び出され、
 * ステータスパネル (上部) の即時描画を妨げずに、
 * 下部コンテンツのデータをストリーミング配信する。
 */

interface Props {
  reservation: JobReservation;
  customer: JobCustomer;
  vehicle: JobVehicle;
  tenantId: string;
}

export default async function JobTabsLoader({ reservation, customer, vehicle, tenantId }: Props) {
  const supabase = await createSupabaseServerClient();

  // 証明書 (vehicle_id 優先、無ければ customer_id)
  const certificatesPromise: Promise<JobCertificate[]> = (async () => {
    if (reservation.vehicle_id) {
      const { data } = await supabase
        .from("certificates")
        .select("public_id, status, created_at, service_price, customer_name")
        .eq("tenant_id", tenantId)
        .eq("vehicle_id", reservation.vehicle_id)
        .order("created_at", { ascending: false });
      return (data ?? []) as JobCertificate[];
    }
    if (reservation.customer_id) {
      const { data } = await supabase
        .from("certificates")
        .select("public_id, status, created_at, service_price, customer_name")
        .eq("tenant_id", tenantId)
        .eq("customer_id", reservation.customer_id)
        .order("created_at", { ascending: false });
      return (data ?? []) as JobCertificate[];
    }
    return [];
  })();

  // 請求・見積書 (customer_id ベース)
  const documentsPromise: Promise<JobDocument[]> = (async () => {
    if (!reservation.customer_id) return [];
    const { data } = await supabase
      .from("documents")
      .select("id, doc_number, doc_type, status, total, issued_at, due_date")
      .eq("tenant_id", tenantId)
      .eq("customer_id", reservation.customer_id)
      .in("doc_type", ["invoice", "consolidated_invoice", "estimate", "receipt", "delivery"])
      .order("created_at", { ascending: false });
    return (data ?? []) as JobDocument[];
  })();

  const [certificates, documents] = await Promise.all([certificatesPromise, documentsPromise]);

  return (
    <JobWorkflowModeSwitch
      reservation={reservation}
      customer={customer}
      vehicle={vehicle}
      certificates={certificates}
      documents={documents}
    />
  );
}
