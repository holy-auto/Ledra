import { NextRequest } from "next/server";
import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return apiUnauthorized();
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
