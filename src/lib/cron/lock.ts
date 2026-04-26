import type { createServiceRoleAdmin } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createServiceRoleAdmin>;

/**
 * 同名 cron の同時多重起動を防ぐための短命ロック。
 *
 * 使い方:
 *   const result = await withCronLock(supabase, "billing", 600, async () => {
 *     ...heavy work...
 *     return { ok: true };
 *   });
 *   if (!result.acquired) return apiJson({ ok: true, skipped: "lock-held" });
 *   return apiJson(result.value);
 *
 * - `ttlSeconds` 経過後は別 cron が奪取可能 (落ちた cron からの自己修復)。
 * - 例外時も finally で release するので次回以降をブロックしない。
 */
export async function withCronLock<T>(
  supabase: SupabaseAdmin,
  task: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const { data, error } = await supabase.rpc("acquire_cron_lock", {
    p_task: task,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    // RPC 自体が失敗したらロックなしで処理を続行 (cron を止めない)。
    // 取得失敗時の二重起動より、cron が完全停止する方がリスクが大きい。
    console.warn("[cron-lock] acquire failed; proceeding without lock", {
      task,
      error: error.message,
    });
    const value = await fn();
    return { acquired: true, value };
  }
  if (!data) {
    return { acquired: false };
  }
  try {
    const value = await fn();
    return { acquired: true, value };
  } finally {
    await supabase.rpc("release_cron_lock", { p_task: task }).then(({ error: relErr }) => {
      if (relErr) {
        console.warn("[cron-lock] release failed", { task, error: relErr.message });
      }
    });
  }
}
