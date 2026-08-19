"use client";

import { useCallback, useEffect, type RefObject } from "react";

/**
 * ダイアログ系(BottomSheet 等)の共通アクセシビリティ挙動:
 * Escape で閉じる / Tab フォーカストラップ / 開いたら先頭要素へフォーカス /
 * body スクロールロック。Modal.tsx / Drawer.tsx に重複している同一ロジックの共通化
 * (既存2ファイルの載せ替えは挙動退行を避けるため別タスク。新設コンポーネントはこちらを使う)。
 */
export default function useDialogA11y(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const getFocusableElements = useCallback(() => {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }, [panelRef]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, getFocusableElements]);

  // 開いたら先頭要素へフォーカスし、閉じたら開く前の要素へ復元する
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) focusable[0].focus();
    });
    return () => {
      previouslyFocused?.focus();
    };
  }, [open, getFocusableElements]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
}
