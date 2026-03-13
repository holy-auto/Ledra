"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Resp = {
  billing_active: boolean;
  tenant_name: string | null;
  certificate_status: string | null;
  grace_until: string | null;
  pdf_allowed: boolean;
  grace_days: number;
};

function extractPublicId(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2 && parts[0] === "c") return parts[1];
  return null;
}

function fmtIso(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default function PublicBillingBanner() {
  const pathname = usePathname();
  const pid = useMemo(() => extractPublicId(pathname), [pathname]);
  const [data, setData] = useState<Resp | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      setNotice(qs.get("notice"));
    } catch {
      setNotice(null);
    }
  }, []);

  useEffect(() => {
    if (!pid) return;

    (async () => {
      const res = await fetch(`/api/certificate/public-status?pid=${encodeURIComponent(pid)}`, { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as Resp;
      setData(j);
    })().catch(() => {});
  }, [pid]);

  if (!data) return null;

  if (data.billing_active) return null;

  return (
    <div className="glass-card mb-4 border-amber-500/30 p-4 text-sm text-amber-400">
      <div className="font-semibold">この施工証明書は閲覧できますが、現在「検証」はできません</div>
      <div className="mt-1 text-amber-400/80">
        施工店のサブスクリプションが停止中のため、最新状態の保証・再発行・一部の出力機能は制限されます。
      </div>

      {data.grace_until && (
        <div className="mt-2">
          PDF出力の猶予期限: <b>{fmtIso(data.grace_until)}</b>（猶予 {data.grace_days} 日）
        </div>
      )}

      {!data.pdf_allowed && (
        <div className="mt-2 font-semibold">
          現在、PDF出力は利用できません（支払い停止中）。
        </div>
      )}

      {notice === "pdf_blocked" && (
        <div className="mt-2 font-semibold">
          PDF出力が制限されています。施工店へご確認ください。
        </div>
      )}
    </div>
  );
}
