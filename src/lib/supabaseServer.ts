import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type CookieItem = { name: string; value: string };

function parseCookieHeader(raw: string): CookieItem[] {
  if (!raw) return [];
  return raw.split(/;\s*/).filter(Boolean).map((kv) => {
    const i = kv.indexOf("=");
    const name = i >= 0 ? kv.slice(0, i) : kv;
    const value = i >= 0 ? kv.slice(i + 1) : "";
    return { name, value };
  });
}

export async function createSupabaseServerClient() {
  // Next 16: cookies() can be async
  const store: any = await cookies();

  const getAllCookies = (): CookieItem[] => {
    if (typeof store.getAll === "function") {
      return store.getAll().map((c: any) => ({ name: c.name, value: c.value }));
    }
    const raw = (store.toString?.() as string | undefined) ?? "";
    return parseCookieHeader(raw);
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return getAllCookies();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              // Next のCookieStoreが set を提供
              store.set?.(name, value, options);
            });
          } catch {
            // ignore (Server Components etc.)
          }
        },
      },
    }
  );
}