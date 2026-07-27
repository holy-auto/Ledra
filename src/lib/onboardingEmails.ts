/**
 * オンボーディング drip メールのテンプレート。
 *
 * サインアップから 1 / 3 / 7 日後に、達成済みのマイルストーンに応じた
 * 文面を送信する。HTML はインライン CSS でメールクライアント互換性を確保。
 */

export type OnboardingMilestones = {
  hasShopInfo: boolean;
  hasLogo: boolean;
  hasCustomerOrVehicle: boolean;
  hasFirstCertificate: boolean;
};

export type OnboardingDay = 1 | 3 | 7;

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ledra.jp";

function urlAdmin(path: string): string {
  return `${APP_BASE_URL}${path}`;
}

const SHARED_FOOTER = `
  <p style="margin: 24px 0 8px 0; color: #6b7280; font-size: 12px; line-height: 1.6;">
    本メールは Ledra ご登録者様に自動送信しています。
    通知設定の変更は <a href="${urlAdmin("/admin/settings")}" style="color: #6366f1;">店舗設定</a> から行えます。
  </p>
  <p style="margin: 0; color: #9ca3af; font-size: 11px;">
    Ledra — 自動車整備・コーティング店のAI業務管理SaaS
  </p>
`;

function wrap(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html><body style="margin: 0; padding: 0; background: #f9fafb; font-family: -apple-system, 'Hiragino Sans', sans-serif;">
<div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
  <div style="background: #fff; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <h1 style="margin: 0 0 16px 0; font-size: 18px; color: #111827; line-height: 1.5;">${title}</h1>
    ${bodyHtml}
    ${SHARED_FOOTER}
  </div>
</div>
</body></html>`;
}

function ctaButton(label: string, href: string): string {
  return `<a href="${href}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">${label}</a>`;
}

/** Day 1: ログイン直後の動機付け、最初のアクション提案 */
function buildDay1(shopName: string, m: OnboardingMilestones): { subject: string; html: string; text: string } {
  const subject = `【Ledra】${shopName} 様、はじめての証明書発行までの3ステップ`;

  const nextAction = !m.hasShopInfo
    ? { label: "店舗情報を登録", href: urlAdmin("/admin/settings"), step: "店舗情報入力" }
    : !m.hasLogo
      ? { label: "ロゴをアップロード", href: urlAdmin("/admin/logo"), step: "ロゴ設定" }
      : !m.hasCustomerOrVehicle
        ? { label: "車両 / 顧客を登録", href: urlAdmin("/admin/vehicles/new"), step: "車両登録" }
        : { label: "最初の証明書を発行", href: urlAdmin("/admin/certificates/new"), step: "証明書発行" };

  const html = wrap(
    `${shopName} 様、Ledra へのご登録ありがとうございます。`,
    `
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
        証明書発行を始めるための準備は、たったの 3 ステップです。<br>
        次は <strong>「${nextAction.step}」</strong> に進みましょう。
      </p>
      <ol style="margin: 0 0 24px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
        <li>店舗情報・ロゴを設定 (証明書PDFに自動反映)</li>
        <li>車両 / 顧客を登録 (車検証OCRで自動入力可)</li>
        <li>施工内容と写真を入力して発行</li>
      </ol>
      <div style="margin: 24px 0; text-align: center;">${ctaButton(nextAction.label, nextAction.href)}</div>
      <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.6;">
        操作方法はいつでも <a href="${urlAdmin("/guide")}" style="color: #6366f1;">操作ガイド</a> でご確認いただけます。
      </p>
    `,
  );

  const text = `${shopName} 様、Ledra へのご登録ありがとうございます。

証明書発行を始めるまでの 3 ステップ:
1. 店舗情報・ロゴを設定
2. 車両 / 顧客を登録
3. 施工内容と写真を入力して発行

次のステップ: ${nextAction.step}
${nextAction.href}

操作ガイド: ${urlAdmin("/guide")}
`;

  return { subject, html, text };
}

/** Day 3: 設定が止まっている人を引き戻す。マイルストーンに応じた具体提案 */
function buildDay3(shopName: string, m: OnboardingMilestones): { subject: string; html: string; text: string } {
  if (m.hasFirstCertificate) {
    const subject = `【Ledra】${shopName} 様、証明書発行おめでとうございます`;
    const html = wrap(
      "順調に発行が始まっています 🎉",
      `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
          初回の証明書発行ありがとうございます。Ledra の真価はここから。
          次は以下の機能で運用効率を上げましょう。
        </p>
        <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
          <li><strong>品目マスタ</strong>: 施工メニューを登録すると請求書作成が3倍速</li>
          <li><strong>コーティング剤マスター</strong>: 使用製品の登録で証明書入力時の選択肢に</li>
          <li><strong>顧客フォロー設定</strong>: 期限リマインダー自動送信でリピート向上</li>
        </ul>
        <div style="margin: 24px 0; text-align: center;">${ctaButton("ダッシュボードを開く", urlAdmin("/admin"))}</div>
      `,
    );
    return {
      subject,
      html,
      text: `${shopName} 様、初回証明書発行ありがとうございます。\n次のステップ: 品目マスタ・コーティング剤マスター・顧客フォロー設定\n${urlAdmin("/admin")}`,
    };
  }

  const subject = `【Ledra】${shopName} 様、つまずきポイントはございますか？`;
  const html = wrap(
    "ご登録から3日。何かお困りごとはございますか？",
    `
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
        ${m.hasShopInfo ? "" : "店舗情報の入力、"}
        ${m.hasLogo ? "" : "ロゴのアップロード、"}
        ${m.hasCustomerOrVehicle ? "" : "車両・顧客の登録"}
        ${m.hasFirstCertificate ? "" : "がまだのようです。"}
      </p>
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
        実データで触る前に、サンプルデータで動作を試すこともできます。<br>
        ダッシュボードの「セットアップ」カードから「🎓 サンプルデータで試す」をクリックしてください。
      </p>
      <div style="margin: 24px 0; text-align: center;">${ctaButton("ダッシュボードを開く", urlAdmin("/admin"))}</div>
      <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.6;">
        操作方法は <a href="${urlAdmin("/guide")}" style="color: #6366f1;">操作ガイド</a>、
        困りごとは <a href="${urlAdmin("/admin/support")}" style="color: #6366f1;">サポート</a> までどうぞ。
      </p>
    `,
  );

  return {
    subject,
    html,
    text: `${shopName} 様、ご登録から3日。お困りごとはございますか？\nダッシュボード: ${urlAdmin("/admin")}\n操作ガイド: ${urlAdmin("/guide")}`,
  };
}

/** Day 7: まだ証明書を発行していない人へ最後の後押し */
function buildDay7(shopName: string, m: OnboardingMilestones): { subject: string; html: string; text: string } {
  if (m.hasFirstCertificate) {
    const subject = `【Ledra】${shopName} 様、もっと活用するための便利機能`;
    const html = wrap(
      "Ledra の便利機能を活かしましょう 🚀",
      `
        <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
          施工証明書の発行に慣れてきたら、以下の機能で業務をさらに効率化できます。
        </p>
        <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #374151; font-size: 14px; line-height: 1.8;">
          <li><strong>Cmd+K (Ctrl+K)</strong>: 画面のどこからでも素早く移動・検索</li>
          <li><strong>顧客 360° ビュー</strong>: 1人の顧客に紐付く車両/証明書/予約/請求を横断管理</li>
          <li><strong>案件ワークフロー</strong>: 予約→作業→証明書→請求を1画面で進行</li>
          <li><strong>Stripe Connect 連携</strong>: 顧客にカード決済リンクを送れる</li>
        </ul>
        <div style="margin: 24px 0; text-align: center;">${ctaButton("操作ガイドを開く", urlAdmin("/guide"))}</div>
      `,
    );
    return {
      subject,
      html,
      text: `${shopName} 様、Ledra の便利機能をぜひお試しください。\n操作ガイド: ${urlAdmin("/guide")}`,
    };
  }

  const subject = `【Ledra】${shopName} 様、最初の証明書発行をぜひ`;
  const html = wrap(
    "ご登録から1週間。最初の1件をぜひ試してみませんか？",
    `
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
        最初の証明書発行は、5 分で完了します。
        実データに不安がある場合は、ダッシュボードの「🎓 サンプルデータで試す」から練習も可能です。
      </p>
      <p style="margin: 0 0 16px 0; color: #374151; font-size: 14px; line-height: 1.7;">
        導入支援が必要な場合は、運営チームから無料でご案内いたします。
      </p>
      <div style="margin: 24px 0; text-align: center;">${ctaButton("サポートに相談する", urlAdmin("/admin/support"))}</div>
      <p style="margin: 16px 0 0 0; color: #6b7280; font-size: 12px; line-height: 1.6;">
        ダッシュボード: <a href="${urlAdmin("/admin")}" style="color: #6366f1;">${urlAdmin("/admin")}</a>
      </p>
    `,
  );

  return {
    subject,
    html,
    text: `${shopName} 様、ご登録から1週間。最初の証明書発行は5分で完了します。\nサポート: ${urlAdmin("/admin/support")}\nダッシュボード: ${urlAdmin("/admin")}`,
  };
}

export function buildOnboardingEmail(
  day: OnboardingDay,
  shopName: string,
  milestones: OnboardingMilestones,
): { subject: string; html: string; text: string } {
  switch (day) {
    case 1:
      return buildDay1(shopName, milestones);
    case 3:
      return buildDay3(shopName, milestones);
    case 7:
      return buildDay7(shopName, milestones);
  }
}
