"use client";

export default function MarketError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">エラーが発生しました</h2>
        <p className="text-sm text-muted">ページの読み込みに失敗しました。</p>
      </div>
      <button onClick={reset} className="btn-primary px-4 py-2 text-sm">再読み込み</button>
    </div>
  );
}
