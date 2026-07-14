"use client";

import { useEffect, useState } from "react";
// CSS is small (~3KB) and harmless to ship eagerly; keep it as a side-effect
// import so PostCSS/Next picks it up. The heavy JS module is loaded lazily.
import "driver.js/dist/driver.css";

// v2: 新機能（AIナビ・サイドバー整理・ピン留め）の説明ステップを追加したので
// キーを更新し、既存ユーザーにも新ステップ入りのツアーを一度だけ再表示する。
// 3ファイル（本ファイル / HelpDrawer / RestartTourButton）で共有する単一の出典。
export const TOUR_DONE_KEY = "ledra_tour_done_v2";

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
        doneBtnText: "はじめる",
        progressText: "{{current}} / {{total}}",
        onDestroyStarted: () => {
          localStorage.setItem(TOUR_DONE_KEY, "1");
          driverObj?.destroy();
        },
        steps: [
          {
            popover: {
              title: "Ledra へようこそ！",
              description:
                "施工証明書の発行・管理を簡単に行えるプラットフォームです。最短で使い始めるための流れを、30 秒でご案内します。",
            },
          },
          {
            element: "[data-tour='setup-checklist']",
            popover: {
              title: "1. ここから順に進めましょう",
              description:
                "設定〜最初の証明書発行までの必要なステップが、実際の進捗に合わせて自動でチェックされます。各行のボタンを押すだけで対応する画面に進めます。",
              side: "bottom",
              align: "start",
            },
          },
          {
            element: "[data-tour='quick-actions']",
            popover: {
              title: "2. 主要な操作はここから",
              description:
                "証明書発行・飛び込み案件・顧客追加など、よく使う作業はクイックアクションから1クリックで起動できます。",
              side: "bottom",
              align: "start",
            },
          },
          {
            popover: {
              title: "3. 素早く検索・移動するには",
              description:
                "画面のどこでも Cmd+K (Mac) / Ctrl+K (Win) を押すとコマンドパレットが開きます。ページ名や顧客名で素早く移動できます。",
            },
          },
          {
            element: "[data-tour='assistant-chat']",
            popover: {
              title: "AIに聞いて画面を開く",
              description:
                "「予約管理を開いて」「先月の売上」など、やりたいことを言葉で打つと画面が切り替わります。何と打てばよいか迷ったら、開いたパネルの「使い方」で例文も見られます。",
              side: "right",
              align: "start",
            },
          },
          {
            element: "[data-tour='all-features-toggle']",
            popover: {
              title: "サイドバーはよく使う機能だけに整理",
              description:
                "常時表示はよく使うコア機能に絞りました。その他の機能は「すべての機能を表示」から開けます。よく使う画面は各項目にカーソルを合わせて📌でピン留めすると、サイドバーに常に表示されます。",
              side: "right",
              align: "start",
            },
          },
          {
            element: "[data-tour='view-mode-toggle']",
            popover: {
              title: "4. 画面をシンプルにするには",
              description:
                "「店頭」に切り替えると、レジ操作など日常業務に絞った大きなボタンの画面になります。管理業務に戻るときは「管理」へ。作業内容に応じていつでも切り替えられます。",
              side: "right",
              align: "start",
            },
          },
          {
            element: "[data-tour='business-mode-toggle']",
            popover: {
              title: "5. 今の作業に合わせて絞り込む",
              description:
                "整備・鈑金塗装・コーティング・PPFから今の作業を選ぶと、関係する機能だけがサイドバーに残ります。「すべて」に戻せばいつでも全項目表示に戻せます。",
              side: "right",
              align: "start",
            },
          },
          {
            element: "[data-tour='customize-features']",
            popover: {
              title: "6. サイドバーを自分好みに",
              description:
                "「機能をカスタマイズ」から、普段使わない機能を非表示にできます。よく使う機能だけを残して、メニューをすっきりさせましょう。",
              side: "right",
              align: "start",
            },
          },
          {
            element: "[data-tour='settings-gear']",
            popover: {
              title: "7. 設定・マスタは歯車に集約",
              description:
                "店舗設定・API連携・各種マスタなどの設定項目は、メニューを増やさないよう右下の歯車ボタンにまとめました。設定を変えたいときはここから開けます。",
              side: "top",
              align: "start",
            },
          },
          {
            element: "[data-tour='approval-inbox']",
            popover: {
              title: "8. AIの下書きは「承認インボックス」で確認",
              description:
                "AIが証明書・発注・請求などの下書きを用意します。人の承認が必要なものはここに集まり、待ち件数が数字（要確認）で表示されます。ワンタップで承認できます。",
              side: "right",
              align: "start",
            },
          },
          {
            element: 'a[href="/admin/support"]',
            popover: {
              title: "困ったときは",
              description:
                "ご不明な点があれば、サポートから運営チームへ直接お問い合わせいただけます。チャット感覚でご利用ください。",
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
