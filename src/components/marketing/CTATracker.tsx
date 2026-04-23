"use client";

import { useEffect } from "react";
import { track } from "@/lib/marketing/analytics";

/**
 * Delegated click listener for CTA buttons.
 *
 * Fires a `cta_clicked` analytics event for any anchor element that
 * carries a `data-cta-location` attribute. Rendered once at the marketing
 * layout level so `CTAButton` can stay a server component.
 */
export function CTATracker(): null {
  useEffect(() => {
    if (typeof document === "undefined") return;

    function onClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[data-cta-location]");
      if (!anchor) return;
      const location = anchor.dataset.ctaLocation ?? "";
      const label = anchor.dataset.ctaLabel ?? anchor.textContent?.trim() ?? "";
      const href = anchor.getAttribute("href") ?? undefined;
      track({ name: "cta_clicked", props: { location, label, href } });
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
