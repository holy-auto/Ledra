import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold text-muted">404</h1>
        <h2 className="text-lg font-semibold text-primary">ページが見つかりません</h2>
        <p className="text-sm text-muted">お探しのページは存在しないか、移動した可能性があります。</p>
      </div>
      <Link href="/" className="btn-primary px-4 py-2 text-sm">
        トップページに戻る
      </Link>
    </div>
  );
}
