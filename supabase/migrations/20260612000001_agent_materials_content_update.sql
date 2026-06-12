-- =============================================================
-- Agent Materials — Content Refresh
-- タイトル・説明文をより明確で本番向けの表現に更新
-- =============================================================

update agent_materials set
  title = 'Ledra サービス紹介資料',
  description = '施工証明・アフターフォロー管理サービスのご紹介。主要機能・導入メリット・活用事例をまとめた提案書です。'
where id = '10000000-0000-0000-0000-000000000001'::uuid;

update agent_materials set
  title = '料金プラン・機能比較表',
  description = 'Starter・Standard・Pro・Enterprise の機能比較と月額料金。代理店手数料率の目安も掲載しています。'
where id = '10000000-0000-0000-0000-000000000002'::uuid;

update agent_materials set
  title = '代理店基本契約書（テンプレート）',
  description = '代理店様との契約締結に使用する標準契約書です。記入例・注意事項付き。社内確認後に使用してください。'
where id = '10000000-0000-0000-0000-000000000003'::uuid;

update agent_materials set
  title = 'サービス利用規約（お客様向け）',
  description = 'エンドユーザー（施工店様）向けのサービス利用規約。商談時にお客様への提示にご利用ください。'
where id = '10000000-0000-0000-0000-000000000004'::uuid;

update agent_materials set
  title = '代理店ポータル 操作マニュアル',
  description = '紹介登録・コミッション確認・資料ダウンロード等、代理店ポータルの各機能の操作手順を解説します。'
where id = '10000000-0000-0000-0000-000000000005'::uuid;

update agent_materials set
  title = '顧客向け紹介パンフレット（A4 カラー印刷用）',
  description = '施工証明サービスをわかりやすく説明したお客様向けパンフレット。店舗窓口・商談時にご活用ください。'
where id = '10000000-0000-0000-0000-000000000006'::uuid;

update agent_materials set
  title = 'SNS・Web 用バナー素材セット',
  description = 'Instagram・LINE・自社サイト向け販促バナー。各種サイズ・テキスト有無バリエーション含む ZIP。'
where id = '10000000-0000-0000-0000-000000000007'::uuid;

update agent_materials set
  title = '代理店研修テキスト ① Ledraの特徴と差別化',
  description = 'サービスの強み・競合との違い・よくある反論への対処法など、初回商談に必要な知識をまとめています。'
where id = '10000000-0000-0000-0000-000000000008'::uuid;
