/**
 * GET /api/marketing/resources/[key]/pdf
 *
 * Streams a generated PDF for the requested marketing resource. The set of
 * available resources is registered in `src/lib/marketing/resourcePdf.tsx`.
 * Resources not present in the registry return 404.
 *
 * Only "complete" resources with a production-ready PDF document are wired
 * in. Other cards on `/resources` still collect leads but don't auto-start a
 * download until their PDF is authored.
 */

import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { apiNotFound, apiInternalError } from "@/lib/api/response";
import { RESOURCE_PDFS } from "@/lib/marketing/resourcePdf";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  const entry = RESOURCE_PDFS[key];
  if (!entry) {
    return apiNotFound("Unknown resource key");
  }

  try {
    const buffer = await renderToBuffer(entry.doc());
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${entry.filename}"`,
        "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    return apiInternalError(err, `resource pdf ${key}`);
  }
}
