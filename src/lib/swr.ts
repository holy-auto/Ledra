/**
 * Shared SWR utilities for client-side data fetching with caching.
 */

/** Default JSON fetcher for SWR */
export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error("Fetch failed") as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
};

/**
 * Default SWR config for admin pages.
 * - Revalidate on focus (stale data refreshed when user returns)
 * - Deduplicate requests within 2 seconds
 * - Keep previous data during revalidation
 */
export const adminSwrConfig = {
  fetcher,
  revalidateOnFocus: true,
  dedupingInterval: 2000,
  keepPreviousData: true,
  errorRetryCount: 2,
};

/**
 * SWR config for mostly-static data (menu items, settings).
 * - Revalidate every 5 minutes
 * - Don't revalidate on focus
 */
export const staticSwrConfig = {
  fetcher,
  revalidateOnFocus: false,
  revalidateIfStale: false,
  refreshInterval: 300_000, // 5 minutes
  dedupingInterval: 60_000,
  keepPreviousData: true,
};
