/**
 * MarketingThemeWrapper — Server Component
 *
 * マーケティングページは常にダークテーマ固定のため、
 * クライアントサイドの状態管理は不要。
 * "use client" を削除して SSR を有効化。
 */
export default function MarketingThemeWrapper({
  children,
  className,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <div data-theme="marketing" className={className} {...rest}>
      {children}
    </div>
  );
}
