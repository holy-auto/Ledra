import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiInternalError, apiUnauthorized, apiForbidden } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    // Fetch courses
    const { data: courses } = await supabase
      .from("agent_training_courses")
      .select("id, title, description, category, duration_minutes, is_required, is_published, sort_order, content_url, created_at, updated_at")
      .eq("is_published", true)
      .order("sort_order", { ascending: true });

    // Fetch user progress
    const { data: progress } = await supabase
      .from("agent_training_progress")
      .select("id, course_id, user_id, agent_id, status, progress, started_at, completed_at, created_at, updated_at")
      .eq("user_id", auth.user.id);

    const progressMap = new Map((progress ?? []).map((p) => [p.course_id, p]));

    const enriched = (courses ?? []).map((c: any) => ({
      ...c,
      progress: progressMap.get(c.id) ?? null,
    }));

    // Stats
    const totalCourses = enriched.length;
    const completedCourses = enriched.filter((c: any) => c.progress?.status === "completed").length;
    const requiredCourses = enriched.filter((c: any) => c.is_required).length;
    const requiredCompleted = enriched.filter((c: any) => c.is_required && c.progress?.status === "completed").length;

    return NextResponse.json({
      courses: enriched,
      stats: { total: totalCourses, completed: completedCourses, required: requiredCourses, required_completed: requiredCompleted },
    });
  } catch (e) {
    return apiInternalError(e, "agent training GET");
  }
}

// Update progress
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const body = await request.json().catch(() => ({}));
    const courseId = body.course_id as string;
    const progressVal = Math.min(100, Math.max(0, body.progress ?? 0));
    const status = progressVal >= 100 ? "completed" : progressVal > 0 ? "in_progress" : "not_started";

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("agent_training_progress")
      .upsert(
        {
          course_id: courseId,
          user_id: auth.user.id,
          agent_id: agent.agent_id,
          status,
          progress: progressVal,
          started_at: progressVal > 0 ? now : null,
          completed_at: status === "completed" ? now : null,
        },
        { onConflict: "course_id,user_id" }
      )
      .select("id, course_id, user_id, agent_id, status, progress, started_at, completed_at, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "agent training PUT");
    return NextResponse.json({ progress: data });
  } catch (e) {
    return apiInternalError(e, "agent training PUT");
  }
}
