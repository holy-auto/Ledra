"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW registration failure is non-critical
      });
    }
  }, []);

  return null;
}
