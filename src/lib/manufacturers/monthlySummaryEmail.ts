import { escapeHtml } from "@/lib/sanitize";

export type MonthlySummaryStats = {
  manufacturerName: string;
  /** "2026年4月" style label for the reported month. */
  monthLabel: string;
  certificatesIssued: number;
  newCertifications: number;
  revokedCertifications: number;
  activeCertifiedTenants: number;
  qualityFlaggedCount: number;
  portalUrl: string;
};

/**
 * Builds the subject + HTML for the manufacturer monthly summary email.
 * Kept pure (no I/O) so it can be unit-tested and reused by the cron.
 * All interpolated values are escaped — manufacturer/tenant names are
 * operator-entered and must not break out of the HTML context.
 */
export function buildMonthlySummaryEmail(stats: MonthlySummaryStats): {
  subject: string;
  html: string;
} {
  const name = escapeHtml(stats.manufacturerName);
  const month = escapeHtml(stats.monthLabel);
  const subject = `【Ledra】${stats.manufacturerName} ${stats.monthLabel} 月次サマリー`;

  const row = (label: string, value: number, accent?: boolean) => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #eceef3;color:#444a5e;font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eceef3;text-align:right;font-size:16px;font-weight:700;color:${accent ? "#dc2626" : "#1a1a2e"};">${value.toLocaleString("ja-JP")}</td>
    </tr>`;

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <div style="border-bottom:2px solid #7c3aed;padding-bottom:12px;margin-bottom:20px;">
      <div style="font-size:12px;letter-spacing:2px;color:#8a90a2;">MANUFACTURER MONTHLY SUMMARY</div>
      <h2 style="margin:6px 0 0;color:#1a1a2e;font-size:18px;">${name}　${month} のサマリー</h2>
    </div>
    <p style="color:#444a5e;line-height:1.7;font-size:14px;">
      ${month}の認定施工店ネットワークの稼働状況をお知らせします。
    </p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #eceef3;border-radius:8px;overflow:hidden;">
      ${row("発行件数（当月）", stats.certificatesIssued)}
      ${row("新規認定（当月）", stats.newCertifications)}
      ${row("認定解除（当月）", stats.revokedCertifications)}
      ${row("認定中の施工店（現在）", stats.activeCertifiedTenants)}
      ${row("品質フラグ該当（当月発行分）", stats.qualityFlaggedCount, stats.qualityFlaggedCount > 0)}
    </table>
    ${
      stats.qualityFlaggedCount > 0
        ? `<p style="color:#dc2626;font-size:13px;line-height:1.7;">当月発行分のうち ${stats.qualityFlaggedCount} 件が品質基準（写真・保証・施工内容・顧客名）を満たしていません。ポータルの「品質チェック」でご確認ください。</p>`
        : `<p style="color:#16a34a;font-size:13px;">当月発行分はすべて品質基準を満たしています。</p>`
    }
    <p style="margin:24px 0;">
      <a href="${escapeHtml(stats.portalUrl)}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
        メーカーポータルを開く
      </a>
    </p>
    <div style="border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px;font-size:12px;color:#86868b;">
      この通知は admin ロールの担当者宛に毎月自動送信されています。配信停止は Ledra 運営までご連絡ください。<br>
      Ledra — 株式会社HOLY
    </div>
  </div>`;

  return { subject, html };
}
