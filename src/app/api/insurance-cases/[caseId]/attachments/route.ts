import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ caseId: string }> };

/** GET /api/insurance-cases/[caseId]/attachments — 添付ファイル一覧 */
export async function GET(_req: Request, ctx: RouteContext) {
  const { caseId } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("insurance_case_attachments")
    .select("id, case_id, message_id, uploaded_by, storage_path, file_name, content_type, file_size, visibility, category, created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ attachments: data ?? [] });
}

/** POST /api/insurance-cases/[caseId]/attachments — ファイルアップロード */
export async function POST(req: Request, ctx: RouteContext) {
  const { caseId } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const category = String(formData.get("category") ?? "other");
  const messageId = formData.get("message_id") ? String(formData.get("message_id")) : null;
  const requestedVisibility = String(formData.get("visibility") ?? "shared");

  if (!file) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  // ファイルサイズ制限（10MB）
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "file_too_large", max: "10MB" }, { status: 400 });
  }

  // 保険会社ユーザーは visibility を shared に強制
  const { data: insurerUser } = await supabase
    .from("insurer_users")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  const visibility = insurerUser
    ? "shared"
    : (requestedVisibility === "internal" ? "internal" : "shared");

  // Storage にアップロード
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${caseId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("insurance-cases")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 400 });
  }

  // DB レコード作成
  const { data: attachment, error: insertErr } = await supabase
    .from("insurance_case_attachments")
    .insert({
      case_id: caseId,
      message_id: messageId,
      uploaded_by: auth.user.id,
      storage_path: storagePath,
      file_name: file.name,
      content_type: file.type,
      file_size: file.size,
      visibility,
      category,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 400 });
  }

  // イベントログ
  await supabase.from("insurance_case_events").insert({
    case_id: caseId,
    actor_id: auth.user.id,
    event_type: "attachment_uploaded",
    detail: { attachment_id: attachment.id, file_name: file.name, category },
  });

  return NextResponse.json(attachment, { status: 201 });
}
