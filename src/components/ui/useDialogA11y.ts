"use client";

import { useCallback, useEffect, type RefObject } from "react";

/**
 * ダイアログ系(BottomSheet 等)の共通アクセシビリティ挙動:
 * Escape で閉じる / Tab フォーカストラップ / 開いたら先頭要素へフォーカス /
 * body スクロールロック。Modal.tsx / Drawer.tsx に重複している同一ロジックの共通化
 * (既存2ファイルの載せ替えは挙動退行を避けるため別タスク。新設コンポーネントはこちらを使う)。
 */
/**
 * body のスクロールロックはページに1つしかない資源なので、開いている
 * ダイアログの数を数えて最後の1つが元に戻す。Modal.tsx / Drawer.tsx は今も
 * 直に body を触っているが、こちらが**元の値を覚えて戻す**ので併用できる。
 */
let lockCount = 0;
let previousOverflow = "";

/**
 * 表示されていない要素をフォーカストラップから外す。
 * レスポンシブで `display:none` になっているボタンや `hidden` 属性の要素を
 * 含めると、ブラウザは Tab 移動でそこを飛ばすので「最後の要素」を取り違え、
 * **フォーカスがダイアログの外へ抜ける。**
 *
 * ponytail: `getClientRects()` を使うのが本来だが jsdom が常に空を返すため、
 * 祖先を辿って `hidden` 属性と computed style を見る形にしている。上限は
 * 「祖先の display:none をブラウザで確実に拾えるのは、その祖先自身を見たとき
 * だけ」で、root までしか遡らない。ダイアログの外に隠し親がある構造は対象外。
 */
function isHidden(el: HTMLElement, root: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n && n !== root.parentElement; n = n.parentElement) {
    if (n.hasAttribute("hidden") || n.getAttribute("aria-hidden") === "true") return true;
    const style = window.getComputedStyle(n);
    if (style.display === "none" || style.visibility === "hidden") return true;
  }
  return false;
}

export default function useDialogA11y(open: boolean, onClose: () => void, panelRef: RefObject<HTMLElement | null>) {
  const getFocusableElements = useCallback(() => {
    const root = panelRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !isHidden(el, root));
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
    // **閉じているときは body に触らない。** 以前は else 節で無条件に "" を入れて
    // いたので、別の Modal が開いている最中に閉じた BottomSheet がマウントされる
    // だけで、そのモーダルのスクロールロックを解除していた。
    if (!open) return;
    if (lockCount === 0) previousOverflow = document.body.style.overflow;
    lockCount += 1;
    document.body.style.overflow = "hidden";
    return () => {
      lockCount -= 1;
      // **最後の1つが閉じたときだけ元に戻す。** 2つ開いていて片方を閉じただけで
      // ページのスクロールが戻ってしまうのを防ぐ。元の値を覚えて戻すので、
      // 直接 body を触っている既存の Modal/Drawer と併用しても噛み合う
      if (lockCount === 0) document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}
