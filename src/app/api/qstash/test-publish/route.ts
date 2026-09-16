import { NextRequest } from "next/server";
import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";

export async function POST(req: NextRequest) {
  // B-L3 是正 (2026-09-08): 以前は CRON_SECRET の比較に `!==` を使っており
  // 非定数時間だった。他の cron 系エンドポイントと同じ verifyCronRequest
  // （timingSafeEqual 比較）に統一する。
  const { authorized, error: authError } = verifyCronRequest(req);
  if (!authorized) {
    return apiUnauthorized(authError);
  }

  try {
    const result = await enqueueInsuranceCaseCreated({
      source: "manual-test",
      message: "Hello from test-publish",
      createdAt: new Date().toISOString(),
    });

    console.info("[QSTASH][test-publish] success:", JSON.stringify(result));

    return Response.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("[QSTASH][test-publish] failed:", error);

    return apiInternalError(error, "qstash/test-publish");
  }
}
