"use client";

import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  /** Required for `sortable` columns to actually reorder rows — returns the comparable value for a row */
  sortValue?: (row: T) => string | number;
  className?: string;
  /** Hide this column in mobile card view */
  hideOnMobile?: boolean;
  /** Use as card title in mobile view */
  cardTitle?: boolean;
}

interface BulkAction {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "danger";
  onAction: (selectedKeys: Set<string>) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  emptyMessage?: string;
  bulkActions?: BulkAction[];
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  selectable = false,
  selectedKeys,
  onSelectionChange,
  emptyMessage = "データがありません",
  bulkActions,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedData = useMemo(() => {
    const col = sortKey ? columns.find((c) => c.key === sortKey) : undefined;
    if (!col?.sortValue) return data;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [data, columns, sortKey, sortDir]);

  const allSelected = data.length > 0 && data.every((row) => selectedKeys?.has(rowKey(row)));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(rowKey)));
    }
  };

  const toggleOne = (key: string) => {
    if (!onSelectionChange || !selectedKeys) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onSelectionChange(next);
  };

  return (
    <div className="glass-card overflow-hidden">
      {selectable && selectedKeys && selectedKeys.size > 0 && bulkActions && (
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border-default bg-accent-dim px-4 py-2.5">
          <span className="text-sm font-medium text-accent">{selectedKeys.size}件選択中</span>
          <div className="flex items-center gap-2 ml-auto">
            {bulkActions.map((action, i) => (
              <button
                key={i}
                onClick={() => action.onAction(selectedKeys)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  action.variant === "danger"
                    ? "bg-[var(--accent-red-dim)] text-danger hover:bg-[var(--accent-red)]/20"
                    : "bg-[var(--bg-surface)] text-primary hover:bg-surface-hover"
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
            <button
              onClick={() => onSelectionChange?.(new Set())}
              className="text-sm text-muted hover:text-primary transition-colors ml-2"
            >
              選択解除
            </button>
          </div>
        </div>
      )}
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default text-left">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="accent-[var(--accent-blue)]"
                    aria-label="すべて選択"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`section-tag px-4 py-3 ${col.sortable ? "cursor-pointer select-none hover:text-secondary" : ""} ${col.className ?? ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <span className="text-[10px]">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center text-sm text-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => {
                const key = rowKey(row);
                const isSelected = selectedKeys?.has(key) ?? false;
                return (
                  <tr
                    key={key}
                    className={`transition-colors hover:bg-surface-hover/40 ${onRowClick ? "cursor-pointer" : ""} ${isSelected ? "bg-accent-dim" : ""}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selectable && (
                      <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(key)}
                          className="accent-[var(--accent-blue)]"
                          aria-label="行を選択"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 text-primary ${col.className ?? ""}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card view */}
      <div className="md:hidden">
        {data.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">{emptyMessage}</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {sortedData.map((row) => {
              const key = rowKey(row);
              const isSelected = selectedKeys?.has(key) ?? false;
              const titleCol = columns.find((c) => c.cardTitle);
              const visibleCols = columns.filter((c) => !c.hideOnMobile && c !== titleCol);

              return (
                <div
                  key={key}
                  className={`p-4 transition-colors ${onRowClick ? "cursor-pointer active:bg-surface-hover/40" : ""} ${isSelected ? "bg-accent-dim" : ""}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(key)}
                          className="accent-[var(--accent-blue)]"
                          aria-label="行を選択"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {titleCol && <div className="text-sm font-medium text-primary mb-2">{titleCol.render(row)}</div>}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {visibleCols.map((col) => (
                          <div key={col.key}>
                            <div className="text-[10px] font-medium text-muted uppercase tracking-wider">
                              {col.header}
                            </div>
                            <div className="text-sm text-primary mt-0.5">{col.render(row)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
