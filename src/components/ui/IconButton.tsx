"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type IconButtonVariant = "ghost" | "outline" | "danger";
/** md=44px が既定(v2.0 §3.4 の最小タッチターゲット 44×44)。sm は高密度なデスクトップ管理画面専用。 */
type IconButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<IconButtonVariant, string> = {
  ghost: "btn-ghost",
  outline: "btn-outline",
  danger: "btn-danger",
};

const SIZE_CLASS: Record<IconButtonSize, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-12 w-12",
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** アイコンのみのボタンのため必須(スクリーンリーダー用)。 */
  "aria-label": string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** 18x18 / strokeWidth 1.5 のインライン SVG(規約)。 */
  children: ReactNode;
}

/**
 * 正方形のアイコン専用ボタン。`btn-ghost p-1` 等のアドホック実装の共通化。
 * Button は padding ベースで高さ非固定のため、タッチターゲットを固定できる別プリミティブとする。
 */
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", size = "md", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={props.type ?? "button"}
        className={`${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} shrink-0 items-center justify-center p-0 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
export default IconButton;
