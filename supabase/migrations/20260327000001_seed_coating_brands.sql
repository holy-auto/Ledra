-- Seed: プラットフォーム共通コーティングブランド＆製品マスタ
-- tenant_id = NULL → 全テナント参照可能（読み取り専用）

DO $$
DECLARE
  -- Brand IDs
  b_ceramic_pro  uuid := gen_random_uuid();
  b_gyeon        uuid := gen_random_uuid();
  b_carpro       uuid := gen_random_uuid();
  b_gtechniq     uuid := gen_random_uuid();
  b_igl          uuid := gen_random_uuid();
  b_modesta      uuid := gen_random_uuid();
  b_nanolex      uuid := gen_random_uuid();
  b_tac_system   uuid := gen_random_uuid();
  b_keeper       uuid := gen_random_uuid();
  b_echelon      uuid := gen_random_uuid();
  b_gzox         uuid := gen_random_uuid();
  b_crystal_guard uuid := gen_random_uuid();
  b_genesis      uuid := gen_random_uuid();
  b_schild       uuid := gen_random_uuid();
  b_kubebond     uuid := gen_random_uuid();
  b_fireball     uuid := gen_random_uuid();
  b_luminus      uuid := gen_random_uuid();
  b_bullet       uuid := gen_random_uuid();
  b_blask        uuid := gen_random_uuid();
  b_ultracoat    uuid := gen_random_uuid();
  b_feynlab      uuid := gen_random_uuid();
  b_system_x     uuid := gen_random_uuid();
  b_3m           uuid := gen_random_uuid();
  b_nasiol       uuid := gen_random_uuid();
  b_g_guard      uuid := gen_random_uuid();
  b_sensha       uuid := gen_random_uuid();
  b_g_power      uuid := gen_random_uuid();
  b_pika_rain    uuid := gen_random_uuid();
  b_ceramic_pro_ion uuid := gen_random_uuid();
  b_kamikaze     uuid := gen_random_uuid();
  b_ulgo         uuid := gen_random_uuid();
  b_adams        uuid := gen_random_uuid();
  b_cbp          uuid := gen_random_uuid();
  b_crystal_proc uuid := gen_random_uuid();
  b_kisho        uuid := gen_random_uuid();
  b_pellucid     uuid := gen_random_uuid();
  b_koch_chemie  uuid := gen_random_uuid();
  b_26jpn        uuid := gen_random_uuid();
BEGIN

-- ===== Brands =====
INSERT INTO brands (id, tenant_id, name, description, website_url) VALUES
  (b_ceramic_pro,   NULL, 'Ceramic Pro',    '世界最大級のセラミックコーティングネットワーク。多層施工による最高レベルの保護。', 'https://www.ceramicpro.com'),
  (b_gyeon,         NULL, 'GYEON',          '韓国発のプロフェッショナルセラミックコーティングブランド。高い撥水性とツヤが特徴。', 'https://www.gyeonquartz.com'),
  (b_carpro,        NULL, 'CarPro',         'イスラエル発。CQuartzシリーズで世界的に人気。プロからDIYまで幅広い製品展開。', 'https://www.carpro-global.com'),
  (b_gtechniq,      NULL, 'Gtechniq',       '英国発。Crystal Serumシリーズを中心にプロフェッショナル向けセラミックコーティングを展開。', 'https://www.gtechniq.com'),
  (b_igl,           NULL, 'IGL Coatings',   'マレーシア発。Ecocoatシリーズ、低VOCのエコフレンドリーなセラミックコーティング。', 'https://www.iglcoatings.com'),
  (b_modesta,       NULL, 'Modesta',        '日本発の高級ガラスコーティング。限定ディーラーのみ施工可能なプレミアムブランド。', 'https://www.modesta.co'),
  (b_nanolex,       NULL, 'Nanolex',        'ドイツ発。Si3Dシリーズのプロフェッショナルセラミックコーティング。高耐久・高硬度。', 'https://www.nanolex.com'),
  (b_tac_system,    NULL, 'TAC System',     '韓国発。Quartz, Moonlight等のガラスコーティング。日本市場でも人気。', 'https://www.tacsystem.com'),
  (b_keeper,        NULL, 'KeePer',         '日本最大級のカーコーティングチェーン。クリスタルキーパー、ダイヤモンドキーパーが代表製品。', 'https://www.keepercoating.jp'),
  (b_echelon,       NULL, 'ECHELON',        '石橋工業の日本製ガラスコーティングブランド。Zen-Xeroシリーズなど高品質な製品群。', 'https://www.echelon-coating.com'),
  (b_gzox,          NULL, 'G''zox',         'ソフト99が展開するプロフェッショナルカーコーティングブランド。リアルガラスコートが代表。', 'https://www.gzox.com'),
  (b_crystal_guard  ,NULL, 'CrystalGuard',  '日本製のガラスコーティング。独自のSiO2技術で高い耐久性と光沢を実現。', NULL),
  (b_genesis,       NULL, 'Genesis Stella', '日本製の高級ガラスコーティング。独自のナノテクノロジーでプロ向けに展開。', NULL),
  (b_schild,        NULL, 'Schild',         'ドイツ技術を採用した日本向けプロ用コーティング。高硬度ガラス被膜が特徴。', NULL),
  (b_kubebond,      NULL, 'KUBEBOND',       '台湾発。Diamond 9H等の高硬度セラミックコーティング。ナノテクノロジー採用。', 'https://www.kubebond.com'),
  (b_fireball,      NULL, 'Fireball',       'マレーシア発。世界18カ国展開のプロフェッショナルカーディテイリングブランド。', 'https://www.fireball-japan.com'),
  (b_luminus,       NULL, 'LUMINUS',        '韓国発。グラフェン・セラミック技術のプロ用コーティング。DIYからプロ施工まで幅広い展開。', NULL),
  (b_bullet,        NULL, 'BULLET',         'FunCruise運営のプロ用カーディテイリング製品ブランド。高施工性シラン系コーティング。', 'https://www.propolish.net'),
  (b_blask,         NULL, 'BLASK',          '米国RAYNO社のカーケアブランド。グラフェン+SiO2+カルナバ配合。', 'https://blaskjp.com'),
  (b_ultracoat,     NULL, 'Ultracoat',      'ポーランド発。ナノテクノロジー活用の高品質セラミックコーティング。', 'https://arinomama.co.jp/collections/ultracoat'),
  (b_feynlab,       NULL, 'FEYNLAB',        '世界初の自己修復セラミックコーティングを開発。HEAL Seriesが代表製品。認定ディテイラー専用。', 'https://feynlab.jp'),
  (b_system_x,      NULL, 'System X',       '米国航空宇宙産業由来のセラミックコーティング技術。高い耐薬品性と耐久性。', NULL),
  (b_3m,            NULL, '3M',             '世界的化学メーカー3Mのセラミックコーティング。4層重ね塗り可能。CBP加盟店で施工。', NULL),
  (b_nasiol,        NULL, 'NASIOL',         'トルコ発。ナノセラミックコーティング。トルコ政府支援の革新的製品開発。', NULL),
  (b_g_guard,       NULL, 'G.Guard',        '2002年開発の日本製ガラスコーティング。スプレー工法で均一な被膜形成。モース硬度9-10H。', 'https://www.gguard.net'),
  (b_sensha,        NULL, 'SENSHA（洗車の王国）', '日本発。フランチャイズ展開のコーティング＆洗車ブランド。', 'https://www.sensha.com.co.jp'),
  (b_g_power,       NULL, 'G-POWER',        '日本発。G-POWER 88等のプロ用ガラスコーティング。業界注目メーカー。', NULL),
  (b_pika_rain,     NULL, 'ピカピカレイン',    '日本発。ECサイト中心で展開するセラミック＆ガラスコーティング。DIY～セミプロ向け。', 'https://www.pikapikarain.com'),
  (b_ceramic_pro_ion, NULL, 'Opti-Coat',    '米国発。パーマネント（永久）セラミックコーティングの先駆者。ディーラー施工専用。', NULL),
  (b_kamikaze,      NULL, 'Kamikaze Collection', '横浜発。Miyabi/ISM/Zipangシリーズ。世界のプロディテイラーから高評価。', 'https://kamikaze-collection.store'),
  (b_ulgo,          NULL, 'ULGO',         '日本発。カーメイクアートプロと化学メーカー共同開発。自社工場で全製品生産。', 'https://www.ulgo.jp'),
  (b_adams,         NULL, 'Adam''s Polishes', '米国発。グラフェンセラミックコーティングで人気。日本正規代理店あり。', 'https://adamspolishes.jp'),
  (b_cbp,           NULL, 'カービューティープロ（CBP）', 'ディテーリングサービス全国ネット展開。PROMAX EXE EVO-1等の独自コーティング。', 'https://www.cbp.co.jp'),
  (b_crystal_proc,  NULL, 'クリスタルプロセス', '日本のケミカルメーカー。ハイテクX1シリーズ等プロ用ガラスコーティング多数。', 'https://crystalprocess.co.jp'),
  (b_kisho,         NULL, 'KISHO',        '日本製。51年の実績を持つプロ用セラミックコーティングメーカー。OEM供給も。', 'https://www.kisho-coating.com'),
  (b_pellucid,      NULL, 'Pellucid（ペルシード）', '日本製。浸透型ガラスコーティング。カー用品店で人気の高いブランド。', 'https://pellucid.co.jp'),
  (b_koch_chemie,   NULL, 'Koch Chemie',  'ドイツ発。80年以上の歴史を持つプロ用カーケアケミカルメーカー。', NULL),
  (b_26jpn,         NULL, '26JPN',        '日本×英国のケミカル技術融合。Crystal Coat等のプロ用セラミックコーティング。', 'https://www.26jpn.com')
ON CONFLICT (id) DO NOTHING;

-- ===== Coating Products =====

-- Ceramic Pro
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_ceramic_pro, NULL, 'Ceramic Pro ION',        'ION',     '最新フラッグシップ。イオン交換テクノロジー採用。2液構造（BASE+TOP）で9Hを超える硬度。'),
  (b_ceramic_pro, NULL, 'Ceramic Pro 9H',         '9H',      '最大10層重ね塗り可能。4層以上で最高硬度9H。世界80カ国以上で施工。'),
  (b_ceramic_pro, NULL, 'Ceramic Pro Light',      'Light',   '1層仕上げのエントリーモデル。ツヤと撥水を手軽に実現。'),
  (b_ceramic_pro, NULL, 'Ceramic Pro Sport',      'Sport',   'メンテナンス用トップコート。撥水性の維持に最適。'),
  (b_ceramic_pro, NULL, 'Ceramic Pro Rain',       'Rain',    'ウィンドウ用撥水コーティング。視界確保と安全性向上。'),
  (b_ceramic_pro, NULL, 'Ceramic Pro Wheel & Caliper', 'WC', 'ホイール・キャリパー専用の耐熱コーティング。'),
  (b_ceramic_pro, NULL, 'Ceramic Pro Leather',    'Leather', 'レザーシート保護用コーティング。');

-- GYEON
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_gyeon, NULL, 'GYEON Q² Mohs+',       'Q²Mohs+',    'フラッグシップ。最高硬度＋優れた耐スクラッチ性。3〜5年耐久。'),
  (b_gyeon, NULL, 'GYEON Q² Mohs',        'Q²Mohs',     'プロ向け高硬度コーティング。深いツヤと強い撥水。'),
  (b_gyeon, NULL, 'GYEON Q² One',          'Q²One',      '1層仕上げの高性能コーティング。施工効率に優れる。'),
  (b_gyeon, NULL, 'GYEON Q² Pure EVO',     'Q²PureEVO',  'DIY向けエントリーモデル。手軽に高品質な仕上がり。'),
  (b_gyeon, NULL, 'GYEON Q² Rim',          'Q²Rim',      'ホイール専用コーティング。耐熱・防汚性能。'),
  (b_gyeon, NULL, 'GYEON Q² View',         'Q²View',     'ガラス撥水コーティング。'),
  (b_gyeon, NULL, 'GYEON Q² Leather Shield', 'Q²LS',     'レザー保護コーティング。');

-- CarPro (CQuartz)
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_carpro, NULL, 'CQuartz Professional',  'CQPRO',    'プロ専用。最高レベルの硬度と耐久性。認定施工店のみ。'),
  (b_carpro, NULL, 'CQuartz Finest Reserve', 'CQFR',    '超プレミアム。限定生産の最高級コーティング。'),
  (b_carpro, NULL, 'CQuartz UK 3.0',        'CQUK3',    'プロシューマー向け高性能コーティング。2年以上の耐久性。'),
  (b_carpro, NULL, 'CarPro DLUX',           'DLUX',     'ホイール・トリム用コーティング。耐熱・防汚。'),
  (b_carpro, NULL, 'CarPro FlyBy Forte',    'FBF',      'ガラス撥水コーティング。長期耐久。');

-- Gtechniq
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_gtechniq, NULL, 'Crystal Serum Ultra',  'CSU',   'プロ専用フラッグシップ。デュアルレイヤー（7nm+20nm）構造。10H硬度、最大9年保証。'),
  (b_gtechniq, NULL, 'Crystal Serum Light',  'CSL',   'プロシューマー向け。9H硬度、CSUの80%の性能。最大5年耐久。'),
  (b_gtechniq, NULL, 'C1 Crystal Lacquer',   'C1',    'エントリーレベル。7H硬度のセラミックコーティング。'),
  (b_gtechniq, NULL, 'EXO v5',              'EXOv5',  '超撥水トップコート。CSL/CSUとのコンボで最高の防汚性。18-24ヶ月耐久。'),
  (b_gtechniq, NULL, 'HALO',                'HALO',   'フレキシブルフィルムコーティング。PPF保護に最適。'),
  (b_gtechniq, NULL, 'G1 ClearVision',      'G1',     'ガラス用撥水コーティング。');

-- IGL Coatings
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_igl, NULL, 'Ecocoat Kenzo',    'Kenzo',    'フラッグシップ。グラフェンナノプレートレット配合2液式（Base+Top）。10H硬度、最大5年耐久。'),
  (b_igl, NULL, 'Ecocoat Eclipse',   'Eclipse',  'プロ向けハイパフォーマンス。10H硬度、極めて高い耐薬品性。REACH準拠。'),
  (b_igl, NULL, 'Ecocoat Premier',   'Premier',  'プレミアムセラミックコーティング。高光沢＋防汚性。'),
  (b_igl, NULL, 'Ecocoat Quartz+',  'Quartz+',  'Quartz+Polyの組合せ。3年保証のセラミックコーティング。'),
  (b_igl, NULL, 'Ecocoat Quartz',   'Quartz',   'エントリープロ向け。2年保証のセラミックコーティング。'),
  (b_igl, NULL, 'Ecocoat Poly',     'Poly',     '1年耐久のエントリーモデル。驚異的な光沢。施工が容易。'),
  (b_igl, NULL, 'Ecocoat Wheel',    'Wheel',    'ホイール専用コーティング。耐熱・防汚。');

-- Modesta
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_modesta, NULL, 'BC-05',  'BC-05',  'フラッグシップ。3D分子構造のガラスコート。最大10年耐久。キャンディのような深い艶。'),
  (b_modesta, NULL, 'BC-04',  'BC-04',  'ナノチタンガラスコーティング。深い光沢と反射。ダーク系カラーに最適。'),
  (b_modesta, NULL, 'BC-06',  'BC-06',  '耐熱性ハードガラスコーティング。'),
  (b_modesta, NULL, 'BC-08',  'BC-08',  '超撥水ガラスコーティング。セルフクリーニング効果。');

-- Nanolex
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_nanolex, NULL, 'Si3D',         'Si3D',      'プロ向けセラミックコーティング。高硬度・高光沢。'),
  (b_nanolex, NULL, 'Si3D HD',      'Si3D-HD',   '高密度版。より厚い被膜と深いツヤ。'),
  (b_nanolex, NULL, 'Urban Glass Sealant', 'UGS', 'ガラス撥水コーティング。');

-- TAC System
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_tac_system, NULL, 'Quartz Max',    'QMax',     'フラッグシップガラスコーティング。最高硬度。'),
  (b_tac_system, NULL, 'Moonlight',     'ML',       '深い艶と撥水性を両立するガラスコーティング。'),
  (b_tac_system, NULL, 'Quartz',        'QTZ',      'スタンダードガラスコーティング。高コスパ。');

-- KeePer
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_keeper, NULL, 'EXキーパー',            'EX',       '最高級。VP326被膜+プライマーガラス。有機質被膜で水シミ根本防止。3年ノーメンテ。'),
  (b_keeper, NULL, 'Wダイヤモンドキーパー',  'WDK',      'ガラス2層+レジン1層の3層構造。ノーメンテ3年、メンテ有で5年耐久。'),
  (b_keeper, NULL, 'ダイヤモンドキーパー',   'DK',       'ガラス+レジン2層構造。約1ミクロンの厚い被膜。ノーメンテ3年、メンテ有で5年。'),
  (b_keeper, NULL, 'エコダイヤキーパー',     'EDK',      'ダイヤモンドキーパーの簡易版。コストパフォーマンスに優れる。'),
  (b_keeper, NULL, 'クリスタルキーパー',     'CK',       'ガラス被膜の1年コーティング。最もポピュラー。年1回の施工。'),
  (b_keeper, NULL, 'フレッシュキーパー',     'FK',       'ポリマーコーティング。手軽なエントリーモデル。');

-- ECHELON
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_echelon, NULL, 'Zen-Xero DYNAMIX',   'ZX-DX',    '最上位モデル。ナノハイブリッドガラス被膜+専用フッ素撥水剤。接触角110°。'),
  (b_echelon, NULL, 'Zen-Xero',           'ZX',       'プレミアムガラスコーティング。無機と有機のハイレベル融合。超撥水・高硬度。'),
  (b_echelon, NULL, '1043 NANO-FIL',      'NF',       'ロングセラー。3Dネットワーク構造被膜で高硬度+しなやかさ。超滑水性。'),
  (b_echelon, NULL, 'FE-1043',            'FE-1043',  '元祖モデル。単層固化能力を持つ革新的素材。卓越した膜厚感。'),
  (b_echelon, NULL, 'CS-1',               'CS-1',     '親水性重視。コーティング性能と施工のしやすさを両立。'),
  (b_echelon, NULL, 'New Version',         'NV',       '19年ぶりリニューアル。使いやすさと高性能を両立。');

-- G'zox (ソフト99)
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_gzox, NULL, 'ハイモースコート ジ・エッジ',  'HM-EDGE',  'G''ZOX史上最高品質。2層構造の撥水タイプ。圧倒的な撥水力と防汚性能。'),
  (b_gzox, NULL, 'ハイモースコート ザ・グロウ',  'HM-GLOW',  '2層構造の疎水タイプ。膜厚ガラス系被膜トップコートで深い艶。'),
  (b_gzox, NULL, 'リアルガラスコート classM',   'RGC-M',    'リアルガラスコート最上位。強力な撥水性+深い艶感。'),
  (b_gzox, NULL, 'リアルガラスコート classH',   'RGC-H',    '疎水タイプ。素早い水キレ性能で雨ジミ防止。'),
  (b_gzox, NULL, 'リアルガラスコート classR',   'RGC-R',    '撥水タイプ。高耐熱性で汚れ固着を防止。'),
  (b_gzox, NULL, 'ハイパービュー',              'HV',       'ウインドウガラス用耐久撥水システム。'),
  (b_gzox, NULL, 'ホイールコート',              'WC',       'ホイール表面にガラス系コーティング被膜を形成。');

-- CrystalGuard
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_crystal_guard, NULL, 'CrystalGuard Barrier',   'CGB',  '高硬度ガラスコーティング。紫外線カット機能。'),
  (b_crystal_guard, NULL, 'CrystalGuard Protect',   'CGP',  'スタンダードガラスコーティング。');

-- Genesis Stella
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_genesis, NULL, 'Genesis Stella V3',     'GSV3',   'フラッグシップ。超高硬度ガラスコーティング。'),
  (b_genesis, NULL, 'Genesis Stella Prime',  'GSP',    'プロ向けスタンダードコーティング。');

-- Schild
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_schild, NULL, 'Schild Veil',      'SV',     'ドイツ技術のガラスコーティング。高耐候性。'),
  (b_schild, NULL, 'Schild Veil Type-T','SVT',   '撥水タイプ。雨天でのセルフクリーニング効果。');

-- KUBEBOND
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_kubebond, NULL, 'KUBEBOND ION',       'ION',     '最上位。イオン交換技術採用のナノセラミック。強化ガラス級硬度。'),
  (b_kubebond, NULL, 'Diamond 9H',         'D9H',     '第6世代。SGS認定9H硬度、接触角125°。3層（D9H×2+NanoX×1）標準施工。'),
  (b_kubebond, NULL, 'Diamond 9H 5層',     'D9H-5',   'Diamond 9H×4層+NanoX×1層の5層プレミアム施工。'),
  (b_kubebond, NULL, 'Nano X',             'NanoX',   'Diamond 9Hのトップコート。防汚性とスリック感を付与。');

-- Fireball
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_fireball, NULL, 'Fireball Fusion',     'FF',      'フラッグシップ。グラフェン配合セラミックコーティング。'),
  (b_fireball, NULL, 'Fireball Ultimate',   'FU',      '超高硬度プロ専用コーティング。'),
  (b_fireball, NULL, 'Fireball Phoenix',    'FP',      'セルフヒーリング機能付きコーティング。'),
  (b_fireball, NULL, 'Fireball Pirouette',  'PIR',     'セラミックコーティング上塗り用。滑沢性・ビーディング回復。');

-- LUMINUS
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_luminus, NULL, 'LUMINUS Diamond Pro',    'LM-DP',   'フラッグシップ。ダイヤモンド配合のプロ用セラミックコーティング。'),
  (b_luminus, NULL, 'LUMINUS Ceramic Pro',    'LM-CP',   'プロ用セラミックコーティング。高耐久・高硬度。'),
  (b_luminus, NULL, 'LUMINUS Graphene Pro',   'LM-GP',   'グラフェン配合プロ用コーティング。極めて高い耐薬品性。'),
  (b_luminus, NULL, 'LUMINUS Slick Pro',      'LM-SP',   'プロ用滑水コーティング。超滑水性能。'),
  (b_luminus, NULL, 'LM Graphene Spray Pro',  'LM-GSP',  'DIY/メンテナンス用グラフェンスプレー。高い耐薬品性で話題。');

-- BULLET (FunCruise)
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_bullet, NULL, 'kaiserjp フロンティア',     'KJ-FR',    '高施工性シラン系浸透型コーティング剤。'),
  (b_bullet, NULL, '3D HYBRID コンディションキーパー', '3D-CK', '3D HYBRID COAT施工面の撥水効果・滑走性メンテナンス。'),
  (b_bullet, NULL, '3D HYBRID COAT',          '3D-HC',    'ハイブリッドコーティング。3D分子構造で高耐久。');

-- BLASK
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_blask, NULL, 'No.12 Graphene Water',    'BL-12',    '一番人気。グラフェン+SiO2+カルナバ配合。圧倒的撥水力と深い艶。'),
  (b_blask, NULL, 'No.13 Sleek Perfect',     'BL-13',    'チタン+グラフェン+カルナバ+SiO2含有。美しい光沢と滑らかさ。'),
  (b_blask, NULL, 'BLASK Pro Ceramic',       'BL-PC',    'プロ施工店専用セラミックコーティング。認定店のみ施工可。'),
  (b_blask, NULL, 'BLASK Body Prep',         'BL-BP',    'コーティング前の脱脂剤。'),
  (b_blask, NULL, 'BLASK Iron Cleanse',      'BL-IC',    '鉄粉除去剤。');

-- Ultracoat
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_ultracoat, NULL, 'Ultracoat Graphene Pro',  'UC-GP',   'プロ用グラフェンセラミックコーティング。最新ナノテクノロジー。'),
  (b_ultracoat, NULL, 'Ultracoat Ceramic Pro',   'UC-CP',   'プロ用セラミックコーティング。紫外線・酸化から保護。'),
  (b_ultracoat, NULL, 'Ultracoat Si Reload',     'UC-SR',   'SiO2配合のメンテナンス用スプレーコーティング。');

-- FEYNLAB
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_feynlab, NULL, 'HEAL PLUS',              'HEAL+',    '最上位。4層10μm膜厚。セラミック含有50%超。自己修復性最高。約7年耐久。'),
  (b_feynlab, NULL, 'HEAL LITE',              'HEAL-L',   '2層5μm膜厚。50℃の熱で小キズ自己修復。約5年耐久。疎水タイプ。'),
  (b_feynlab, NULL, 'CERAMIC ULTRA V2',       'CUV2',     'セラミックシリーズ最上位。5μm膜厚。5年耐久。'),
  (b_feynlab, NULL, 'CERAMIC',                'CER',      'スタンダードセラミック。耐久3年。耐薬品pH2-13。'),
  (b_feynlab, NULL, 'The Original CERAMIC',   'OC',       'エントリー。1年耐久。コストパフォーマンス重視。'),
  (b_feynlab, NULL, 'MATTE CERAMIC',          'MC',       'マット塗装専用セラミックコーティング。質感を変えず保護。');

-- System X
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_system_x, NULL, 'System X Max',          'SX-MAX',   'フラッグシップ。航空宇宙技術由来の最高耐久コーティング。'),
  (b_system_x, NULL, 'System X Pro',          'SX-PRO',   'プロ向けセラミックコーティング。高い耐薬品性。'),
  (b_system_x, NULL, 'System X Crystal',      'SX-CRY',   'スタンダードセラミックコーティング。'),
  (b_system_x, NULL, 'System X Glass',        'SX-GL',    'ガラス用撥水コーティング。');

-- 3M
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_3m, NULL, '3M セラミックコーティング',        '3M-CC',    '10nmの極薄層で傷を埋め平滑化。最大4層重ね塗り可能。硬度3Hのフレキシブル被膜。'),
  (b_3m, NULL, '3M スコッチガード ペイントプロテクション', '3M-PPF', 'PPF（ペイントプロテクションフィルム）。');

-- NASIOL
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_nasiol, NULL, 'NASIOL ZR53',         'NAS-ZR53',  'フラッグシップセラミックコーティング。36ヶ月耐久。'),
  (b_nasiol, NULL, 'NASIOL MetalCoat',    'NAS-MC',    'ホイール・金属パーツ用セラミックコーティング。'),
  (b_nasiol, NULL, 'NASIOL GlasShield',   'NAS-GS',    'ガラス用撥水コーティング。');

-- G.Guard
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_g_guard, NULL, 'G.Guard Slide',         'GG-SL',    '滑水タイプ。スプレー工法で均一な被膜。モース硬度9-10H。'),
  (b_g_guard, NULL, 'G.Guard Hydro',         'GG-HY',    '親水タイプ。水シミになりにくい仕上がり。'),
  (b_g_guard, NULL, 'G.Guard マット',         'GG-MT',    'マットカラー塗装対応。質感を変えず保護。');

-- SENSHA（洗車の王国）
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_sensha, NULL, 'Crystal Glow',           'SEN-CG',   '高光沢ガラスコーティング。フランチャイズ店舗で施工。'),
  (b_sensha, NULL, 'Mirror Coat',            'SEN-MC',   '鏡面仕上げコーティング。'),
  (b_sensha, NULL, 'Hydro Flash',            'SEN-HF',   '撥水コーティング。');

-- G-POWER
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_g_power, NULL, 'G-POWER 88',            'GP-88',    '業界注目のガラスコーティング。高い防汚性と耐久性。'),
  (b_g_power, NULL, 'G-POWER FX',            'GP-FX',    'プロ用ガラスコーティング。');

-- ピカピカレイン
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_pika_rain, NULL, 'ピカピカレイン PREMIUM',    'PPR-PM',   'プレミアムセラミックコーティング。3年耐久。'),
  (b_pika_rain, NULL, 'ピカピカレイン CERAMIC',    'PPR-CE',   'セラミックコーティング。DIY向け高品質。'),
  (b_pika_rain, NULL, 'ピカピカレイン 滑水性',     'PPR-SL',   '滑水タイプのガラスコーティング。'),
  (b_pika_rain, NULL, 'ピカピカレイン for Wheels', 'PPR-WH',   'ホイール専用コーティング。');

-- Opti-Coat
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_ceramic_pro_ion, NULL, 'Opti-Coat Pro+',    'OCP+',    'パーマネントセラミックコーティング。一度の施工で半永久的な保護。'),
  (b_ceramic_pro_ion, NULL, 'Opti-Coat Pro 3',   'OCP3',    '第3世代パーマネントコーティング。'),
  (b_ceramic_pro_ion, NULL, 'Opti-Coat Pro',     'OCP',     'オリジナルパーマネントコーティング。認定ディーラー専用。');

-- Kamikaze Collection
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_kamikaze, NULL, 'ENREI COAT',      'KC-EN',    '最新最上位。認定ディテイラー専用の2層式プレミアムコーティング。'),
  (b_kamikaze, NULL, 'ZIPANG COAT 2.0', 'KC-ZP',    'ISM PRO技術進化版。セミセルフヒーリング機能。Miyabi重ね塗りで5年超耐久。'),
  (b_kamikaze, NULL, 'MIYABI COAT 2.0', 'KC-MY',    'ベースコート。カーボンナノチューブ配合。米国市場で5年連続トップセラー。'),
  (b_kamikaze, NULL, 'ISM COAT v3.0',   'KC-ISM',   'トップコート。Miyabiとの2層施工で高い保護性能。'),
  (b_kamikaze, NULL, 'Over Coat',       'KC-OC',    'メンテナンス用トップコート。光沢・滑水性の回復。');

-- ULGO
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_ulgo, NULL, 'ULGO Premium Series',  'UL-PRM',   '自己修復機能付き最上位シリーズ。認定プロショップ専用。'),
  (b_ulgo, NULL, 'ULGO AP-1（撥水）',     'UL-AP1',   'Wレイヤー撥水タイプ。高濃度ガラス成分。膜厚感のある重厚な仕上がり。'),
  (b_ulgo, NULL, 'ULGO AP-2（疎水）',     'UL-AP2',   'Wレイヤー疎水タイプ。ウォータースポット低減。しっとりとした光沢。'),
  (b_ulgo, NULL, 'ULGO Ceramic Mold',    'UL-CM',    'プラスチックパーツ専用セラミックコーティング。');

-- Adam's Polishes
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_adams, NULL, 'Graphene Ceramic Coating Advanced',       'AD-GCCA',  '最上位。10H硬度、9年超保護。レジン含有50%増。正規施工店専用。'),
  (b_adams, NULL, 'Graphene Ceramic Coating',                'AD-GCC',   'グラフェン配合セラミックコーティング。高い接触角110-118°。'),
  (b_adams, NULL, 'Graphene Ceramic Spray Coating Advanced', 'AD-GCSA',  'スプレータイプ上位版。レジン含有量2倍。'),
  (b_adams, NULL, 'Graphene Ceramic Spray Coating',          'AD-GCS',   'スプレータイプ。DIY向け簡単施工。');

-- カービューティープロ（CBP）
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_cbp, NULL, 'PROMAX EXE EVO-1',  'CBP-EVO1',  '最上位。ポリシラザンBASE+シランTOPの多層構造。高密度・高硬度・高耐久。'),
  (b_cbp, NULL, 'PCX-S9',            'CBP-S9',    'デュアルレイヤー被膜。優れた排水性・防汚性・持続性。'),
  (b_cbp, NULL, 'PCX-S8',            'CBP-S8',    '撥水系ガラスコーティング。艶やかな光沢としなやかさ。'),
  (b_cbp, NULL, 'PCX-S7',            'CBP-S7',    'ワニス構造の緻密な架橋構造。防汚性に優れた新素材ガラス系。'),
  (b_cbp, NULL, 'PROMAX EXE',        'CBP-EXE',   'ポリシラザン主成分の2液混合単層式。5年サポート。');

-- クリスタルプロセス
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_crystal_proc, NULL, 'ハイテクX1 8500',          'CP-8500',  '最高級。有効成分85%、硬度6H。5年超持続。完全無機質ガラス被膜。'),
  (b_crystal_proc, NULL, 'ハイテクX1 ダイヤモンドコート', 'CP-DC',   '4nmダイヤモンド微粒子配合。強度と撥水性を極限まで向上。'),
  (b_crystal_proc, NULL, 'ハイテクX1 5000',          'CP-5000',  '有効成分70%。低溶剤・低臭。3年超持続。'),
  (b_crystal_proc, NULL, 'ハイテクX1 高速硬化コート',   'CP-QC',   '塗布2時間で溶剤に強い被膜形成。納車時間短縮。'),
  (b_crystal_proc, NULL, 'Si-700',                  'CP-Si700', '施工30分後に最高光沢+超撥水。メンテナンス向け。'),
  (b_crystal_proc, NULL, 'エヴァンスコート',           'CP-EV',   '塗布面が白く判別可能。抜群の作業性。');

-- KISHO
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_kisho, NULL, 'KISHO Si-901',    'KS-901',   'フラッグシップ。51年の技術が詰まったプロ用ガラスコーティング。'),
  (b_kisho, NULL, 'KISHO Si-811',    'KS-811',   'スタンダードプロ用ガラスコーティング。100%日本製。');

-- Pellucid（ペルシード）
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_pellucid, NULL, 'プレミアムトップコート180',  'PCD-901',  'ウォータースポット・雨ジミ付着抑制。プロ施工車にも対応。'),
  (b_pellucid, NULL, 'ドロップショット2',         'PCD-812',  '浸透型撥水ガラスコーティング。カー用品店人気No.1クラス。'),
  (b_pellucid, NULL, 'ハイドロコーティング',       'PCD-811',  '疎水タイプの浸透型ガラスコーティング。');

-- Koch Chemie
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_koch_chemie, NULL, '1K Nano',       'KC-1KN',   'プロ用ナノセラミックコーティング。ドイツ品質。'),
  (b_koch_chemie, NULL, 'Speed Glass Coating', 'KC-SGC', 'ガラス用撥水コーティング。');

-- 26JPN
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_26jpn, NULL, 'Crystal Coat',     '26-CC',    'プロ用セラミックスプレーシーラント。6-9ヶ月耐久。'),
  (b_26jpn, NULL, 'Sapphire V2',      '26-SP',    'セラミックスプレーコーティング上位版。');

END $$;
