import PageHeader from "@/components/ui/PageHeader";
import AnnouncementsClient from "./AnnouncementsClient";

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
