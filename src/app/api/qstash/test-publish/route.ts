import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";

export async function POST() {
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
