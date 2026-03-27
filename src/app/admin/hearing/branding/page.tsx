import PageHeader from "@/components/ui/PageHeader";
import BrandingHearingClient from "./BrandingHearingClient";

export default function BrandingHearingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        tag="ブランディング"
        title="導入ヒアリングシート"
        description="オリジナル施工証明書のカスタマイズや大型店舗導入に向けた要件をヒアリングします。"
      />
      <BrandingHearingClient />
    </div>
  );
}
