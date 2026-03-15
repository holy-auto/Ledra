import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";

export async function POST() {
  const result = await enqueueInsuranceCaseCreated({
    source: "manual-test",
    message: "Hello from test-publish",
    createdAt: new Date().toISOString(),
  });

  return Response.json({
    ok: true,
    result,
  });
}
