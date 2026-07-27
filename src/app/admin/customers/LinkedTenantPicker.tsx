"use client";

import { useEffect, useRef, useState } from "react";

interface TenantSearchResult {
  tenant_id: string;
  company_name: string;
  slug: string;
}

/**
 * 取引先（Ledra 利用店）を検索して選択するピッカー。
 * customers.linked_tenant_id を設定するために使う（BtoB 指名請求の顧客解決に必要）。
 * 既存の GET /api/admin/tenants/search を再利用。
 */
export default function LinkedTenantPicker({
  valueId,
  valueName,
  onChange,
}: {
  valueId: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TenantSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }
    timeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/tenants/search?q=${encodeURIComponent(query)}`);
        const j = await res.json().catch(() => ({}));
        setResults(j.tenants ?? []);
        setOpen(true);
      } catch {
        /* ignore */
      }
      setSearching(false);
    }, 300);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  // 既に選択済み（id あり）: ラベル＋解除
  if (valueId) {
    return (
      <div className="flex items-center gap-2">
        <div className="input-field bg-surface-hover flex-1 truncate">{valueName || "選択済みの取引先"}</div>
        <button
          type="button"
          className="text-xs text-red-500 hover:underline shrink-0"
          onClick={() => {
            onChange("", "");
            setQuery("");
          }}
        >
          解除
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        className="input-field"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="取引先の店舗名で検索…（Ledra 利用店）"
      />
      {searching && <p className="text-[10px] text-muted mt-1">検索中…</p>}
      {open && results.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((t) => (
            <button
              key={t.tenant_id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-surface-hover text-sm"
              onMouseDown={() => {
                onChange(t.tenant_id, t.company_name);
                setQuery("");
                setOpen(false);
              }}
            >
              {t.company_name}
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.length >= 1 && !searching && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg p-3 text-xs text-muted">
          該当する店舗が見つかりません
        </div>
      )}
    </div>
  );
}
