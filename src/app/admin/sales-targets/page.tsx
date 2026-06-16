import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import SalesTargetsClient from "./SalesTargetsClient";

export const metadata: Metadata = {
  title: "売上目標",
};

export default function SalesTargetsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        tag="売上・経営"
        title="売上目標"
        description="月次の売上目標を設定すると、ダッシュボードに達成率がリアルタイム表示されます"
      />
      <SalesTargetsClient />
    </div>
  );
}
