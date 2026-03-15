import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

async function handler(request: Request) {
  const body = await request.json().catch(() => null);

  console.log("[QSTASH][insurance-case-created] payload:", JSON.stringify(body));

  return Response.json({
    ok: true,
    received: true,
    body,
  });
}

export const POST = verifySignatureAppRouter(handler);
