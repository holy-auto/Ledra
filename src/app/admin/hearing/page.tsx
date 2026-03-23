import PageHeader from "@/components/ui/PageHeader";
import HearingClient from "./HearingClient";

export default function HearingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        tag="ヒアリング"
        title="ヒアリングチェックシート"
        description="お客様の要望を聞き取り、顧客登録・車両登録・証明書発行にスムーズに連携します。"
      />
      <HearingClient />
    </div>
  );
}
