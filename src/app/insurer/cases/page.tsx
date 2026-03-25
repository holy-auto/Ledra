export default function InsurerCasesPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          CASE MANAGEMENT
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
          案件管理
        </h1>
      </header>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <div className="text-lg font-bold text-amber-800">準備中</div>
        <p className="mt-2 text-sm text-amber-700">
          案件管理機能は現在開発中です。保険事故案件の作成、加盟店とのチャット、ファイル添付などの機能が今後追加されます。
        </p>
      </section>
    </div>
  );
}
