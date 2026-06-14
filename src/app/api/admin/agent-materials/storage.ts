/**
 * Shared constants/helpers for the agent-materials (営業資料) upload flow.
 *
 * Large files (PDF / pptx / mp4) are uploaded directly from the browser to
 * Supabase Storage via a signed upload URL so they never pass through the
 * Next.js route handler — otherwise the hosting platform's request body limit
 * (~4.5MB on Vercel) rejects them with HTTP 413 before the handler runs.
 */

export const MATERIALS_BUCKET = "agent-materials";

/** Max material file size. Generous enough for slide decks and short videos. */
export const MAX_MATERIAL_SIZE = 100 * 1024 * 1024; // 100MB

/** Storage paths are confined to this prefix; the metadata route validates it. */
export const MATERIALS_PREFIX = "materials/";

const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/zip",
  "video/mp4",
  "video/quicktime",
]);

const ALLOWED_EXT = new Set<string>([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "zip",
  "mp4",
  "mov",
]);

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

/**
 * Browsers occasionally report an empty or generic MIME type (e.g. for .pptx).
 * Accept the file if either its declared MIME type or its extension is allowed.
 */
export function isAllowedMaterialType(fileType: string, fileName: string): boolean {
  if (fileType && ALLOWED_MIME.has(fileType)) return true;
  return ALLOWED_EXT.has(extOf(fileName));
}

/** Builds a sanitized, prefix-confined storage path for a new upload. */
export function materialStoragePath(fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${MATERIALS_PREFIX}${Date.now()}_${safeName}`;
}

/** Validates a client-supplied storage path matches what we hand out. */
export function isValidMaterialPath(path: string): boolean {
  return /^materials\/\d+_[a-zA-Z0-9._-]+$/.test(path);
}
