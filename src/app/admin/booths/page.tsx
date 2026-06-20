import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import BoothsClient from "./BoothsClient";

export const metadata: Metadata = {
  title: "ピット管理",
};

export default function BoothsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        tag="業務"
        title="ピット管理"
        description="PPF・コーティング・磨き等のブースを登録し、日別の稼働状況を確認します"
      />
      <BoothsClient />
    </div>
  );
}
