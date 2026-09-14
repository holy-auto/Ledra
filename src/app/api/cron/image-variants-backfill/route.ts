/**
 * GET /api/cron/image-variants-backfill
 *
 * Generates WebP variants (thumbnail + medium) for `certificate_images`
 * rows where the variant columns are still NULL. Targets the long tail
 * of certificates uploaded before migration 20260512000002, plus any
 * rows where the upload-time sharp pipeline silently failed.
 *
 * Strategy:
 *   - Scan up to BATCH_SIZE rows per invocation, ordered oldest-first
 *     (so a fresh tenant catches up over many cron windows rather than
 *     starving on a single huge tenant).
 *   - For each row: download original from storage → generate variants
 *     → upload variants → UPDATE the row with the new paths.
 *   - Best-effort: any single-row failure logs and continues; the cron
 *     exit code only flips on systemic errors (auth / DB unreachable).
 *
 * Schedule: every 15 minutes. Lock at 14 minutes to prevent overlap.
 * Reference: PR #376 + docs/architecture-roadmap.md §9.3 残作業
 */

import type { NextRequest } from "next/server";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { sendCronFailureAlert } from "@/lib/cronAlert";
import { withCronLock } from "@/lib/cron/lock";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages/constants";
import { generateImageVariants, variantStoragePath } from "@/lib/certificateImages/generateVariants";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;

interface ImageRow {
  id: string;
  tenant_id: string;
  storage_path: string;
  content_type: string | null;
  thumbnail_path: string | null;
  medium_path: string | null;
}

/**
 * Backfill a single image. Returns 'done' / 'partial' / 'skipped' so the
 * cron summary surfaces what happened across the batch.
 */
async function backfillOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  row: ImageRow,
): Promise<"done" | "partial" | "skipped" | "error"> {
  if (row.thumbnail_path && row.medium_path) return "skipped";

  const { data: downloaded, error: downloadErr } = await admin.storage
    .from(CERTIFICATE_IMAGE_BUCKET)
    .download(row.storage_path);

  if (downloadErr || !downloaded) {
    logger.warn("variants-backfill: download failed", {
      id: row.id,
      path: row.storage_path,
      error: downloadErr?.message ?? "no body",
    });
    return "error";
  }

  // Supabase storage download returns a Blob; convert to Buffer.
  const buf = Buffer.from(await downloaded.arrayBuffer());
  const variants = await generateImageVariants(buf);

  const patch: { thumbnail_path?: string; medium_path?: string } = {};

  if (!row.thumbnail_path && variants.thumbnail) {
    const path = variantStoragePath(row.storage_path, "thumbnail");
    const { error } = await admin.storage
      .from(CERTIFICATE_IMAGE_BUCKET)
      .upload(path, variants.thumbnail.buffer, { contentType: "image/webp", upsert: true });
    if (!error) patch.thumbnail_path = path;
    else logger.warn("variants-backfill: thumbnail upload failed", { id: row.id, error: error.message });
  }

  if (!row.medium_path && variants.medium) {
    const path = variantStoragePath(row.storage_path, "medium");
    const { error } = await admin.storage
      .from(CERTIFICATE_IMAGE_BUCKET)
      .upload(path, variants.medium.buffer, { contentType: "image/webp", upsert: true });
    if (!error) patch.medium_path = path;
    else logger.warn("variants-backfill: medium upload failed", { id: row.id, error: error.message });
  }

  if (Object.keys(patch).length === 0) return "error";

  const { error: updateErr } = await admin
    .from("certificate_images")
    .update(patch)
    .eq("id", row.id)
    .eq("tenant_id", row.tenant_id);

  if (updateErr) {
    logger.warn("variants-backfill: DB update failed", { id: row.id, error: updateErr.message });
    return "error";
  }

  // 'partial' when only one of the two variants made it through.
  const targetCount = (row.thumbnail_path ? 0 : 1) + (row.medium_path ? 0 : 1);
  return Object.keys(patch).length === targetCount ? "done" : "partial";
}

export async function GET(req: NextRequest) {
  const { authorized, error: authErr } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized(authErr);

  try {
    const admin = createServiceRoleAdmin(
      "cron:image-variants-backfill — scans certificate_images for missing variant paths",
    );

    const result = await withCronLock(admin, "image-variants-backfill", 840, async () => {
      const { data, error } = await admin
        .from("certificate_images")
        .select("id, tenant_id, storage_path, content_type, thumbnail_path, medium_path")
        .or("thumbnail_path.is.null,medium_path.is.null")
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (error) {
        throw new Error(`certificate_images scan failed: ${error.message}`);
      }

      const rows = (data ?? []) as ImageRow[];
      const stats = { scanned: rows.length, done: 0, partial: 0, skipped: 0, errored: 0 };

      for (const row of rows) {
        const outcome = await backfillOne(admin, row);
        if (outcome === "done") stats.done += 1;
        else if (outcome === "partial") stats.partial += 1;
        else if (outcome === "skipped") stats.skipped += 1;
        else stats.errored += 1;
      }

      return stats;
    });

    if (!result.acquired) return apiOk({ skipped: "lock_held" });
    if (result.value.scanned > 0) {
      logger.info("image-variants-backfill complete", result.value);
    }
    return apiOk({ ok: true, ...result.value });
  } catch (e) {
    await sendCronFailureAlert("image-variants-backfill", e instanceof Error ? e.message : String(e));
    return apiInternalError(e, "cron/image-variants-backfill");
  }
}
