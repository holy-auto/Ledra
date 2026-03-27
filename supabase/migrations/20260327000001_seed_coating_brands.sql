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
  (b_fireball,      NULL, 'Fireball',       'オーストラリア発。高性能なセラミック＆グラフェンコーティングを展開。', 'https://www.fireballcoatings.com')
ON CONFLICT (id) DO NOTHING;

-- ===== Coating Products =====

-- Ceramic Pro
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_ceramic_pro, NULL, 'Ceramic Pro 9H',        '9H',      '多層施工可能なフラッグシップコーティング。最高レベルの硬度と耐久性。'),
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
  (b_gtechniq, NULL, 'Crystal Serum Ultra',  'CSU',  'プロ専用フラッグシップ。10H硬度、最大9年耐久。'),
  (b_gtechniq, NULL, 'Crystal Serum Light',  'CSL',  'プロシューマー向け。CSUの80%の性能。最大5年耐久。'),
  (b_gtechniq, NULL, 'EXO v5',              'EXOv5', '超撥水トップコート。CSLとのコンボが人気。'),
  (b_gtechniq, NULL, 'HALO',                'HALO',  'フレキシブルフィルムコーティング。PPF保護に最適。'),
  (b_gtechniq, NULL, 'G1 ClearVision',      'G1',    'ガラス用撥水コーティング。');

-- IGL Coatings
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_igl, NULL, 'Ecocoat Kenzo',    'Kenzo',    'フラッグシップ。グラフェン配合10H硬度。1.0μm膜厚。最大5年耐久。'),
  (b_igl, NULL, 'Ecocoat Quartz+',  'Quartz+',  'プロ向け。3年保証のセラミックコーティング。'),
  (b_igl, NULL, 'Ecocoat Quartz',   'Quartz',   'エントリープロ向け。2年保証のセラミックコーティング。'),
  (b_igl, NULL, 'Ecocoat Poly',     'Poly',     '1年耐久のエントリーモデル。手軽な施工。'),
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
  (b_keeper, NULL, 'EXキーパー',          'EX',       '最高級。ガラス被膜+レジン2層。深い艶と最大6年耐久。'),
  (b_keeper, NULL, 'ダイヤモンドキーパー',  'DK',       'ガラス被膜+レジン層。深いツヤと3年耐久。'),
  (b_keeper, NULL, 'クリスタルキーパー',    'CK',       'ガラス被膜の1年コーティング。最もポピュラー。'),
  (b_keeper, NULL, 'フレッシュキーパー',    'FK',       'ポリマーコーティング。手軽なエントリーモデル。');

-- ECHELON
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_echelon, NULL, 'Zen-Xero',           'ZX',       'プレミアムガラスコーティング。超撥水・高硬度。'),
  (b_echelon, NULL, 'Zen-Xero MUSE',      'ZX-MUSE',  '最高級ライン。究極のツヤと耐久性。'),
  (b_echelon, NULL, 'New Version',         'NV',       'スタンダードガラスコーティング。安定した品質。'),
  (b_echelon, NULL, 'Nano-Fil',            'NF',       'ナノフィラー配合。傷埋め効果＋コーティング。');

-- G'zox
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_gzox, NULL, 'リアルガラスコート classH',  'RGC-H',   'フラッグシップ。高硬度ガラス被膜。プロ専用。'),
  (b_gzox, NULL, 'リアルガラスコート classR',  'RGC-R',   '撥水タイプのガラスコーティング。'),
  (b_gzox, NULL, 'リアルガラスコート classM',  'RGC-M',   'メンテナンスしやすい親水タイプ。'),
  (b_gzox, NULL, 'ハイドロフィニッシュ',       'HF',      '親水系コーティング。ウォータースポット防止。');

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
  (b_kubebond, NULL, 'Diamond 9H',         'D9H',     'フラッグシップ。9H硬度の超高硬度コーティング。'),
  (b_kubebond, NULL, 'Diamond 9H Sapphire','D9HS',    '最高級ライン。サファイア技術採用。'),
  (b_kubebond, NULL, 'Diamond 9H Wheel',   'D9HW',    'ホイール専用。耐熱・防汚。');

-- Fireball
INSERT INTO coating_products (brand_id, tenant_id, name, product_code, description) VALUES
  (b_fireball, NULL, 'Fireball Fusion',     'FF',    'フラッグシップ。グラフェン配合セラミックコーティング。'),
  (b_fireball, NULL, 'Fireball Ultimate',   'FU',    '超高硬度プロ専用コーティング。'),
  (b_fireball, NULL, 'Fireball Phoenix',    'FP',    'セルフヒーリング機能付きコーティング。');

END $$;
