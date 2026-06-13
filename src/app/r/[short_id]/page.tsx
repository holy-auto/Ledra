import { Suspense } from "react";
import StoreLinkClient from "./StoreLinkClient";

export const dynamic = "force-dynamic";

export default async function StoreLinkPage({ params }: { params: Promise<{ short_id: string }> }) {
  const { short_id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted">読み込み中…</div>}>
      <StoreLinkClient shortId={short_id} />
    </Suspense>
  );
}
