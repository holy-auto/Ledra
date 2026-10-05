import type { Metadata } from "next";
import ReviewPrompt from "@/app/sign/[token]/ReviewPrompt";

export const metadata: Metadata = {
  title: "施工のご感想 | Ledra",
  description: "施工後のご感想をお聞かせください。",
  robots: { index: false, follow: false },
};

/**
 * 証明書発行の数日後に顧客へ届く評価依頼のリンク先（IMP-029 rating_request）。
 * ログイン不要・token のみ。UI は受領サイン完了画面の ReviewPrompt を共用し、受け口だけ
 * /api/rating/[token]（certificate_rating_requests）に差し替える。
 */
export default async function RatingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-gray-950 px-4 py-10">
      <div className="mx-auto max-w-md">
        <ReviewPrompt token={token} endpoint={`/api/rating/${encodeURIComponent(token)}`} />
      </div>
    </main>
  );
}
