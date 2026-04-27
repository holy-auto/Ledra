/**
 * MarketingThemeWrapper — Server Component
 *
 * マーケティングページは常にダークテーマ固定のため、
 * クライアントサイドの状態管理は不要。
 * "use client" を削除して SSR を有効化。
 */
import type { ReactNode } from "react";

export default function MarketingThemeWrapper({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <div data-theme="dark" className={className} {...rest}>
      {children}
    </div>
  );
}
