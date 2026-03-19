import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";

const AnnouncementsClient = dynamic(() => import("./AnnouncementsClient"), {
  loading: () => <div className="animate-pulse h-40 rounded-2xl bg-[rgba(0,0,0,0.04)]" />,
});

export default function AnnouncementsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        tag="ANNOUNCEMENTS"
        title="お知らせ"
        description="運営からのお知らせ・アップデート情報"
      />
      <AnnouncementsClient />
    </div>
  );
}
