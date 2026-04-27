"use client";

export default function MarketingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-8">
      <div className="max-w-md text-center">
        <h2 className="mb-4 text-xl font-semibold text-white">エラーが発生しました</h2>
        <p className="mb-6 text-sm text-gray-200">予期しないエラーが発生しました。再度お試しください。</p>
        <button
          onClick={reset}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 transition-colors"
        >
          再試行
        </button>
      </div>
    </div>
  );
}
