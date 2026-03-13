import InquiriesClient from "./InquiriesClient";

export const dynamic = "force-dynamic";

export default function AdminInquiriesPage() {
  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-2">
          <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
            INQUIRIES
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
            お問い合わせ
          </h1>
          <p className="text-sm text-neutral-500">お客様からのお問い合わせを管理します</p>
        </div>

        <InquiriesClient />
      </div>
    </main>
  );
}
