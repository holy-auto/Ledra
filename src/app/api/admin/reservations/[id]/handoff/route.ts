import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * 申し送りメモ (Staff handoff notes) API
 * ------------------------------------------------------------
 * reservations.handoff_notes (JSONB 配列) に対する追加 / 削除。
 *
 * 構造化された 1 件:
 *   { id, author_id, author_name, content, created_at, priority }
 *
 * テナント分離は reservations の RLS + 明示的な tenant_id 絞り込みで担保。
 * JSONB 配列の read-modify-write のため厳密には TOCTOU が残るが、
 * tenant_id スコープ内に限定され、申し送りメモの性質上致命的な競合は想定しない。
 */

const MAX_NOTES = 50;

const handoffPriority = z.enum(["normal", "important", "urgent"]);

const handoffCreateSchema = z.object({
  content: z.string().trim().min(1, "内容は必須です。").max(2000),
  priority: handoffPriority.default("normal"),
});

type HandoffNote = {
  id: string;
  author_id: string;
  author_name: string;
  content: string;
  created_at: string;
  priority: z.infer<typeof handoffPriority>;
};

/** JSONB から取り出した未知の配列を HandoffNote[] へ安全に正規化する。 */
function normalizeNotes(raw: unknown): HandoffNote[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (n): n is HandoffNote =>
      !!n &&
      typeof n === "object" &&
      typeof (n as HandoffNote).id === "string" &&
      typeof (n as HandoffNote).content === "string",
  );
}

/** セッションユーザの表示名 (user_metadata.display_name) を解決。無ければメールのローカル部 → "スタッフ"。 */
function resolveAuthorName(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string {
  const meta = user.user_metadata ?? undefined;
  const displayName = meta && typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  if (displayName) return displayName;
  const email = user.email ?? "";
  const local = email.includes("@") ? email.split("@")[0] : email;
  return local || "スタッフ";
}

// ─── POST: 申し送りメモを 1 件追加 ───
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "reservations:edit")) return apiForbidden();

    const { id } = await params;

    const parsed = handoffCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { content, priority } = parsed.data;

    // 既存の handoff_notes を取得 (予約存在確認も兼ねる)
    const { data: reservation, error: fetchErr } = await supabase
      .from("reservations")
      .select("id, handoff_notes")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (fetchErr) return apiInternalError(fetchErr, "handoff fetch");
    if (!reservation) return apiNotFound("not_found");

    // 投稿者名はセッションユーザの metadata から解決 (admin 不要)
    const { data: userRes } = await supabase.auth.getUser();
    const authorName = userRes?.user
      ? resolveAuthorName(userRes.user as { email?: string | null; user_metadata?: Record<string, unknown> | null })
      : "スタッフ";

    const existing = normalizeNotes((reservation as { handoff_notes?: unknown }).handoff_notes);

    const newNote: HandoffNote = {
      id: crypto.randomUUID(),
      author_id: caller.userId,
      author_name: authorName,
      content,
      created_at: new Date().toISOString(),
      priority,
    };

    // 新しいものを末尾に push し、上限を超えたら古いもの (先頭) から落とす
    const next = [...existing, newNote].slice(-MAX_NOTES);

    const { data: updated, error: updateErr } = await supabase
      .from("reservations")
      .update({ handoff_notes: next, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, handoff_notes")
      .single();

    if (updateErr) return apiInternalError(updateErr, "handoff update");

    return apiJson({
      ok: true,
      note: newNote,
      handoff_notes: normalizeNotes((updated as { handoff_notes?: unknown }).handoff_notes),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations/handoff POST");
  }
}

// ─── DELETE: ?note_id= で 1 件削除 (自分が追加したもののみ) ───
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "reservations:edit")) return apiForbidden();

    const { id } = await params;
    const noteId = new URL(req.url).searchParams.get("note_id")?.trim() ?? "";
    if (!noteId) return apiValidationError("note_id is required");

    const { data: reservation, error: fetchErr } = await supabase
      .from("reservations")
      .select("id, handoff_notes")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (fetchErr) return apiInternalError(fetchErr, "handoff delete fetch");
    if (!reservation) return apiNotFound("not_found");

    const existing = normalizeNotes((reservation as { handoff_notes?: unknown }).handoff_notes);
    const target = existing.find((n) => n.id === noteId);

    if (!target) return apiNotFound("note_not_found");
    // 自分の投稿のみ削除可 (他人の申し送りは削除させない)
    if (target.author_id !== caller.userId) {
      return apiValidationError("自分が追加した申し送りのみ削除できます。");
    }

    const next = existing.filter((n) => n.id !== noteId);

    const { data: updated, error: updateErr } = await supabase
      .from("reservations")
      .update({ handoff_notes: next, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select("id, handoff_notes")
      .single();

    if (updateErr) return apiInternalError(updateErr, "handoff delete update");

    return apiJson({
      ok: true,
      deleted_id: noteId,
      handoff_notes: normalizeNotes((updated as { handoff_notes?: unknown }).handoff_notes),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "reservations/handoff DELETE");
  }
}
