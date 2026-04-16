"use client";

import { useViewMode } from "@/lib/view-mode/ViewModeContext";
import JobDetailTabs from "./JobDetailTabs";
import StorefrontJobWorkflow from "./StorefrontJobWorkflow";
import type { JobReservation, JobCustomer, JobVehicle, JobCertificate, JobDocument } from "./types";

interface Props {
  reservation: JobReservation;
  customer: JobCustomer;
  vehicle: JobVehicle;
  certificates: JobCertificate[];
  documents: JobDocument[];
}

/**
 * JobWorkflowModeSwitch
 * ------------------------------------------------------------
 * /admin/jobs/[id] のモード切替ラッパー。
 * - storefront: 大ボタン + 次アクション中心のシンプルな 1 画面
 *   (<StorefrontJobWorkflow>)
 * - admin: タブ構成・関連ドキュメント一覧等の詳細ビュー
 *   (<JobDetailTabs>; ステッパーは page.tsx の <JobStatusPanel> が別途担当)
 */
export default function JobWorkflowModeSwitch({ reservation, customer, vehicle, certificates, documents }: Props) {
  const { mode, hydrated } = useViewMode();

  if (!hydrated || mode === "admin") {
    return (
      <JobDetailTabs
        reservation={reservation}
        customer={customer}
        vehicle={vehicle}
        certificates={certificates}
        documents={documents}
      />
    );
  }
  return (
    <StorefrontJobWorkflow
      reservation={reservation}
      customer={customer}
      vehicle={vehicle}
      certificates={certificates}
      documents={documents}
    />
  );
}
