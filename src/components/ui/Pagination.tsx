"use client";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export default function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Show up to 5 page numbers centered on current page
  const range: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);
  for (let i = Math.max(1, end - 4); i <= end; i++) range.push(i);

  return (
    <nav className="flex items-center justify-center gap-1 mt-4" aria-label="ページネーション">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-sm rounded-md border border-divider disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
        aria-label="前のページ"
      >
        ←
      </button>

      {range[0] > 1 && (
        <>
          <button
            onClick={() => onPageChange(1)}
            className="px-3 py-1.5 text-sm rounded-md border border-divider hover:bg-surface-hover transition-colors"
          >
            1
          </button>
          {range[0] > 2 && <span className="px-1 text-muted">…</span>}
        </>
      )}

      {range.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            p === page
              ? "bg-[#0071e3] text-white border-[#0071e3]"
              : "border-divider hover:bg-surface-hover"
          }`}
          aria-current={p === page ? "page" : undefined}
        >
          {p}
        </button>
      ))}

      {range[range.length - 1] < totalPages && (
        <>
          {range[range.length - 1] < totalPages - 1 && <span className="px-1 text-muted">…</span>}
          <button
            onClick={() => onPageChange(totalPages)}
            className="px-3 py-1.5 text-sm rounded-md border border-divider hover:bg-surface-hover transition-colors"
          >
            {totalPages}
          </button>
        </>
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-sm rounded-md border border-divider disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-hover transition-colors"
        aria-label="次のページ"
      >
        →
      </button>
    </nav>
  );
}
