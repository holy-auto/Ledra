import type { Metadata } from "next";
import PageHeader from "@/components/ui/PageHeader";
import StaffClient from "./StaffClient";

export const metadata: Metadata = {
  title: "スタッフ管理",
};

export default function StaffPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        tag="業務"
        title="スタッフ管理"
        description="社内スタッフ・外注職人の登録、スキルタグ・シフト管理、担当者別の施工実績"
      />
      <StaffClient />
    </div>
  );
}
