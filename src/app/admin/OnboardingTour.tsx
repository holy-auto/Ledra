"use client";

import { useEffect, useState } from "react";
// CSS is small (~3KB) and harmless to ship eagerly; keep it as a side-effect
// import so PostCSS/Next picks it up. The heavy JS module is loaded lazily.
import "driver.js/dist/driver.css";

const TOUR_DONE_KEY = "ledra_tour_done";

export default function OnboardingTour(): null {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Only show tour for first-time users
    if (localStorage.getItem(TOUR_DONE_KEY)) return;

    // Wait for sidebar and dashboard to render
    const timer = setTimeout(() => setReady(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    let driverObj: { destroy: () => void; drive: () => void } | null = null;

    // Defer the driver.js bundle until we actually need to render the tour.
    // Returning users (TOUR_DONE_KEY set) never trigger this, so they no
    // longer pay for the parse/eval cost on every /admin visit.
    (async () => {
      const { driver } = await import("driver.js");
      if (cancelled) return;

      driverObj = driver({
        showProgress: true,
        animate: true,
        overlayColor: "rgba(0, 0, 0, 0.5)",
        stagePadding: 8,
        stageRadius: 12,
        popoverClass: "ledra-tour-popover",
        nextBtnText: "次へ",
        prevBtnText: "戻る",
        doneBtnText: "完了",
        progressText: "{{current}} / {{total}}",
        onDestroyStarted: () => {
          localStorage.setItem(TOUR_DONE_KEY, "1");
          driverObj?.destroy();
        },
        steps: [
          {
            popover: {
              title: "Ledraへようこそ！",
              description: "施工証明書の発行・管理を簡単に行えるプラットフォームです。主な機能をご紹介します。",
            },
          },
          {
            element: "nav ul",
            popover: {
              title: "サイドバーナビゲーション",
              description:
                "ここから各機能にアクセスできます。証明書、車両管理、顧客管理など、すべての操作はここから始まります。",
              side: "right",
              align: "start",
            },
          },
          {
            element: 'a[href="/admin/certificates"]',
            popover: {
              title: "証明書一覧",
              description:
                "発行済みの施工証明書を一覧で確認・検索できます。ステータスの管理やPDF出力もここから行えます。",
              side: "right",
            },
          },
          {
            element: 'a[href="/admin/vehicles"]',
            popover: {
              title: "車両管理",
              description: "顧客の車両情報を登録・管理します。証明書の発行には車両の登録が必要です。",
              side: "right",
            },
          },
          {
            element: 'a[href="/admin/settings"]',
            popover: {
              title: "店舗設定",
              description: "店舗名やロゴなど、基本情報を設定できます。まずはここで店舗情報を登録しましょう。",
              side: "right",
            },
          },
          {
            element: 'a[href="/admin/support"]',
            popover: {
              title: "サポート",
              description: "ご不明な点があれば、ここから運営チームにお問い合わせいただけます。お気軽にご連絡ください。",
              side: "right",
            },
          },
        ],
      });

      driverObj.drive();
    })();

    return () => {
      cancelled = true;
      driverObj?.destroy();
    };
  }, [ready]);

  return null;
}

/** Reset tour flag — call this to re-enable the tour */
export function resetTour() {
  localStorage.removeItem(TOUR_DONE_KEY);
}
