"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

/* ------------------------------------------------------------------ */
/*  SidebarShell                                                       */
/*  Shared layout shell for mobile hamburger + overlay + sidebar.      */
/* ------------------------------------------------------------------ */

interface SidebarShellProps {
  children: React.ReactNode;
}

export default function SidebarShell({ children }: SidebarShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-[var(--radius-lg)] border border-border-default bg-[var(--bg-surface-solid)] lg:hidden"
        aria-label="メニュー"
      >
        {open ? (
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        )}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border-subtle bg-[var(--bg-surface-solid)] transition-transform duration-300 ease-out lg:bg-[var(--bg-elevated)] lg:backdrop-blur-[40px] lg:backdrop-saturate-[180%] ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        {children}
      </aside>
    </>
  );
}
