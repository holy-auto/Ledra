import { Client } from "@upstash/qstash";

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

function getBaseUrl() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.VERCEL_URL,
  ].filter(Boolean) as string[];

  const baseUrl = candidates[0];

  if (!baseUrl) {
    throw new Error(
      "Base URL is not set. Set NEXT_PUBLIC_APP_URL or APP_URL in Vercel."
    );
  }

  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

export async function enqueueInsuranceCaseCreated(
  payload: Record<string, unknown>
) {
  const targetUrl = `${getBaseUrl()}/api/qstash/insurance-case-created`;

  console.log("[QSTASH][publish] targetUrl:", targetUrl);
  console.log("[QSTASH][publish] hasToken:", Boolean(process.env.QSTASH_TOKEN));

  const result = await qstash.publishJSON({
    url: targetUrl,
    body: payload,
  });

  console.log("[QSTASH][publish] result:", JSON.stringify(result));

  return result;
}
