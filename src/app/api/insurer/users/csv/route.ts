import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveInsurerCaller, enforceInsurerPlan } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";

type CsvRow = {
  email: string;
  role: "admin" | "viewer" | "auditor";
  display_name: string | null;
};

function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const splitLine = (l: string) => {
    return l.split(",").map((x) => x.trim().replace(/^"(.*)"$/, "$1"));
  };

  let start = 0;
  const head = splitLine(lines[0]).map((x) => x.toLowerCase());
  if (head[0] === "email" && head[1] === "role") start = 1;

  const out: CsvRow[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const email = normalizeEmail(cols[0] || "");
    const role = (cols[1] || "").toLowerCase() as CsvRow["role"];
    const display = (cols[2] || "").trim();
    if (!email) throw new Error(`CSV parse error: empty email at line ${i + 1}`);
    if (!["admin", "viewer", "auditor"].includes(role)) {
      throw new Error(`CSV parse error: invalid role "${cols[1] || ""}" at line ${i + 1}`);
    }
    out.push({
      email,
      role,
      display_name: display ? display : null,
    });
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    if (caller.role !== "admin") return apiForbidden("管理者のみユーザー一括登録が可能です。");

    const planDeny = enforceInsurerPlan(caller, "pro");
    if (planDeny) return planDeny;

    const adminSb = createAdminClient();

    // Check max_users limit before processing
    const { INSURER_PLAN_FEATURES } = await import("@/types/insurer");
    const maxUsers = INSURER_PLAN_FEATURES[caller.planTier]?.max_users ?? 3;

    const { count: currentCount } = await adminSb
      .from("insurer_users")
      .select("id", { count: "exact", head: true })
      .eq("insurer_id", caller.insurerId)
      .eq("is_active", true);


    // CSV読み込み
    const body = await req.text();
    let rows: CsvRow[];
    try {
      rows = parseCsv(body);
    } catch (e) {
      return apiValidationError(e instanceof Error ? e.message : String(e));
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, inserted: 0, created_auth: 0, existing_auth: 0, errors: [] });
    }

    // Validate that adding these users won't exceed max_users
    const remainingSlots = maxUsers - (currentCount ?? 0);
    if (rows.length > remainingSlots) {
      return NextResponse.json({
        ok: false,
        error: "max_users_exceeded",
        message: `ユーザー上限を超過します。現在 ${currentCount ?? 0} 名 / 上限 ${maxUsers} 名。追加可能: ${Math.max(0, remainingSlots)} 名`,
        current: currentCount ?? 0,
        max: maxUsers,
        requested: rows.length,
      }, { status: 400 });
    }

    let createdAuth = 0;
    let existingAuth = 0;
    let upserted = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const r of rows) {
      try {
        const email = r.email;

        // Create auth user if not exists
        const cr = await adminSb.auth.admin.createUser({
          email,
          email_confirm: true,
        });

        if ((cr as any)?.error) {
          const msg = String((cr as any).error?.message ?? (cr as any).error ?? "");
          if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("exists") || msg.toLowerCase().includes("duplicate")) {
            existingAuth++;
          } else {
            throw new Error(`createUser failed: ${msg || "unknown"}`);
          }
        } else {
          createdAuth++;
        }

        const { error: upErr } = await adminSb.rpc("upsert_insurer_user", {
          p_insurer_id: caller.insurerId,
          p_email: email,
          p_role: r.role,
          p_display_name: r.display_name,
        });

        if (upErr) throw new Error(`upsert_insurer_user failed: ${upErr.message}`);
        upserted++;
      } catch (e) {
        errors.push({ email: r.email, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      insurer_id: caller.insurerId,
      total: rows.length,
      upserted,
      created_auth: createdAuth,
      existing_auth: existingAuth,
      errors,
    });
  } catch (e) {
    return apiInternalError(e, "insurer users csv import");
  }
}
