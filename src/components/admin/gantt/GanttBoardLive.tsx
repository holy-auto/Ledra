"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";
import GanttBoard from "@/components/admin/gantt/GanttBoard";
import { todayJst, type GanttData } from "@/lib/gantt/board";

/**
 * 工程ガントの live ラッパー。
 * `/api/admin/gantt` を 10 秒ごとにポーリングし、別画面でステージが進んでも
 * 開きっぱなしの運用ディスプレイに自動反映する。初期データは SSR から渡され、
 * 取得失敗時も前回データを保持する（keepPreviousData）。
 *
 * 開きっぱなしで JST 日付をまたいでも翌日の盤面に切り替わるよう、対象日は
 * クライアント側で算出して 1 分ごとにロールオーバーする（SSR の dateStr に固定しない）。
 */
export default function GanttBoardLive({ initialData, dateStr }: { initialData: GanttData; dateStr: string }) {
  const [date, setDate] = useState(dateStr);

  // JST 日付の変化（= 深夜またぎ）を 1 分ごとに検知し、対象日を切り替える。
  useEffect(() => {
    const id = setInterval(() => {
      const today = todayJst();
      setDate((prev) => (prev === today ? prev : today));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const { data, mutate } = useSWR<{ data: GanttData }>(`/api/admin/gantt?date=${date}`, fetcher, {
    // SSR と同じ日付のときだけ初期データを使う（日付が変わったら取得し直す）。
    fallbackData: date === dateStr ? { data: initialData } : undefined,
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
    dedupingInterval: 5_000,
    errorRetryCount: 2,
  });

  // ジョブ詳細と同じ「1タップ進行」を盤面からも実行する。成功したら即時 revalidate し、
  // 10秒ポーリングを待たずに他画面と同じ状態に揃える。
  async function advanceCase(reservationId: string) {
    const res = await fetch(`/api/admin/reservations/${reservationId}/advance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
    }
    await mutate();
  }

  return <GanttBoard realData={data?.data ?? initialData} dateStr={date} onAdvance={advanceCase} />;
}
