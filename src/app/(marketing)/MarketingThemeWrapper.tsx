"use client";

/**
 * Marketing pages are always dark-themed regardless of user preference.
 * The dark design (gradients, glows, dark-card) uses hardcoded colors
 * throughout all marketing components, so theme toggling only affects /admin.
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
