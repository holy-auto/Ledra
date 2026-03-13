"use client";

import { useEffect, useState } from "react";

export function useInquiryCount(intervalMs = 60_000) {
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/admin/inquiries/count", { cache: "no-store" });
        if (!res.ok) return;
        const j = await res.json();
        if (alive) setPendingCount(j.pending_count ?? 0);
      } catch {
        // ignore
      } finally {
        if (alive) setLoading(false);
      }
    };
    fetchCount();
    const timer = setInterval(fetchCount, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { pendingCount, loading };
}
