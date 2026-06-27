"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import GanttBoard from "@/components/admin/gantt/GanttBoard";
import type { GanttData } from "@/lib/gantt/board";

/**
 * 工程ガントの live ラッパー。
 * `/api/admin/gantt` を 10 秒ごとにポーリングし、別画面でステージが進んでも
 * 開きっぱなしの運用ディスプレイに自動反映する。初期データは SSR から渡され、
 * 取得失敗時も前回データを保持する（keepPreviousData）。
 */
export default function GanttBoardLive({ initialData, dateStr }: { initialData: GanttData; dateStr: string }) {
  const { data } = useSWR<{ data: GanttData }>(`/api/admin/gantt?date=${dateStr}`, fetcher, {
    fallbackData: { data: initialData },
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 5_000,
    errorRetryCount: 2,
  });

  return <GanttBoard realData={data?.data ?? initialData} dateStr={dateStr} />;
}
