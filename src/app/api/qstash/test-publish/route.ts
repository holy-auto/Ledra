import { NextRequest } from "next/server";
import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await enqueueInsuranceCaseCreated({
      source: "manual-test",
      message: "Hello from test-publish",
      createdAt: new Date().toISOString(),
    });

    console.log("[QSTASH][test-publish] success:", JSON.stringify(result));

    return Response.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("[QSTASH][test-publish] failed:", error);

    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Unknown test-publish error",
      },
      { status: 500 }
    );
  }
}
