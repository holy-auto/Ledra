import { makeOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

export const alt = "Ledra｜自動車整備・コーティング店の施工履歴プラットフォーム";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image() {
  return makeOgImage({
    badge: "Ledra",
    title: "現場の技術を、業界の力へ。",
    subtitle: "施工証明・履歴管理・加盟店連携を、ひとつのプラットフォームで。",
  });
}
