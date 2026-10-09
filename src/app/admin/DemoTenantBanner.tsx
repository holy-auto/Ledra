"use client";

import { useCurrentRole } from "@/lib/auth/useCurrentRole";
import { isDemoTenant } from "@/lib/demo";

export default function DemoTenantBanner() {
  const { data, loading } = useCurrentRole();

  if (loading || !data || !isDemoTenant(data.tenant_id)) return null;

  return (
    // 固定しない: AdminTopBar (sticky top-0) と PageBar (sticky top-11) の下に潜り込み、
    // モバイルで 2〜3 行に折り返した分が見出しに重なっていた。pr-16 は固定ハンバーガーの分。
    <div role="status" className="border-b border-amber-400/30 bg-amber-500/10">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 pr-16 text-xs sm:text-sm lg:pr-4">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <div className="text-amber-100">
          <span className="font-semibold text-amber-200">デモ環境</span>
          ：実際の運用感を体験いただけますが、証明書の発行・編集・削除など
          <span className="font-medium text-amber-200">書き込み操作はブロックされます</span>
          。本番利用は
          <a href="/signup" className="ml-1 underline underline-offset-2 hover:text-white">
            新規登録
          </a>
          からどうぞ。
        </div>
      </div>
    </div>
  );
}
