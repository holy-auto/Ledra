import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type InsurerStatus = "active_pending_review" | "active" | "suspended";

type StatusResult = {
  insurer_id: string;
  status: InsurerStatus;
  plan_tier: string | null;
  requested_plan: string | null;
};

/**
 * API route 用: insurer のステータスをチェックし、active 以外なら Response を返す。
 * active なら null を返す（= 通過OK）。
 *
 * Usage:
 *   const deny = await enforceInsurerStatus();
 *   if (deny) return deny;
 */
export async function enforceInsurerStatus(opts?: {
  allowPending?: boolean;
}): Promise<NextResponse | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_my_insurer_status");

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    return NextResponse.json(
      { error: "insurer not found" },
      { status: 403 }
    );
  }

  const row: StatusResult = Array.isArray(data) ? data[0] : data;
  const status = row.status as InsurerStatus;

  if (status === "suspended") {
    return NextResponse.json(
      {
        error: "account_suspended",
        message: "このアカウントは停止されています。管理者にお問い合わせください。",
      },
      { status: 403 }
    );
  }

  if (status === "active_pending_review" && !opts?.allowPending) {
    return NextResponse.json(
      {
        error: "feature_restricted",
        message:
          "現在アカウントは確認中です。この機能は正式開通後にご利用いただけます。",
      },
      { status: 403 }
    );
  }

  // active or (pending + allowPending) → pass
  return null;
}
