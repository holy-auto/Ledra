/**
 * POST /api/admin/documents/ocr
 *
 * 仕入先請求書 / 外注請求書、取引先ごとに様式の違う発注書・依頼書・商談メモの写真を
 * Vision OCR で読み取り、帳票フォーム (DocumentForm) の明細・件名・備考の手打ちを減らす。
 * 結果は DB に永続化しない（抽出値は編集可能な下書きとして
 * フォームに差し込み、金額の確定・送付は人が行う＝壁3）。
 *
 * Body: multipart/form-data
 *   - image: File (image/jpeg | image/png | image/webp, <= 8MB)
 *
 * Auth: 施工店セッション (staff 以上)。
 */
import { withCaller } from "@/lib/api/withCaller";
import { apiOk, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { extractInvoice, toDocumentItems, toDraftHeader } from "@/lib/ai/invoiceOcr";
import { loadAiAutomationSettings, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB

export const POST = withCaller(
  async (req, { caller }) => {
    // 1) テナント単位の rate limit (IP rate limit は withCaller の rateLimit で処理)
    const tenantLimit = await checkRateLimit(req, "identity_ocr", `tenant:${caller.tenantId}`);
    if (tenantLimit) return tenantLimit;

    // 2) multipart 解析
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiValidationError("Content-Type は multipart/form-data を指定してください");
    }
    const form = await req.formData().catch(() => null);
    if (!form) return apiValidationError("multipart の解析に失敗しました");

    const file = form.get("image");
    if (!(file instanceof File)) return apiValidationError("image フィールドに画像を添付してください");
    if (file.size === 0) return apiValidationError("ファイルが空です");
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024}MB を超えています`);
    }
    const mime = file.type;
    if (!ALLOWED_MIME.has(mime)) return apiValidationError("対応形式は JPEG / PNG / WebP です");

    // 3) AI マスタースイッチ OFF / コストキャップ超過 / 書類画像ソース無効時はスキップ（手打ちへ）
    const usage = startAiRouteUsage("/api/admin/documents/ocr");
    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    if (!aiSettings.enabled || !isSourceAllowed(aiSettings, "identity_documents")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({
        status: "skipped" as const,
        items: [],
        notice: "AI 自動入力が停止中のため OCR を実行しませんでした。手動で入力してください。",
      });
    }

    // 4) Vision 呼び出し
    try {
      const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      const extract = await extractInvoice(base64, mime as "image/jpeg" | "image/png" | "image/webp");
      const items = toDocumentItems(extract);

      usage.record({
        tenantId: caller.tenantId,
        userId: caller.userId,
        outcome: "ok",
        meta: { line_count: items.length },
      });

      return apiOk({
        status: "ok" as const,
        items,
        header: {
          supplier_name: extract.supplier_name,
          invoice_number: extract.invoice_number,
          issue_date: extract.issue_date,
          due_date: extract.due_date,
          total_jpy: extract.total_jpy,
          delivery_date: extract.delivery_date,
          ...toDraftHeader(extract),
        },
      });
    } catch (err) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "error" });
      return apiInternalError(err, "POST /api/admin/documents/ocr");
    }
  },
  { minRole: "staff", rateLimit: "identity_ocr", routeName: "documents/ocr POST" },
);
