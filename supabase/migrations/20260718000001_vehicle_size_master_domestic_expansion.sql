-- ============================================================
-- 車種サイズマスタ (vehicle_size_master) の国産車拡充
-- 既存シード (20260322000007) は現行の主要車種が中心で、絶版車・旧車・
-- 軽トラ/軽バン・商用などが手薄だったため、整備/コーティング店が実際に見る
-- 国産車を大きく補完する。
--
-- size_class は寸法 (全長×全幅×全高) の体積から自動計算するため、ここでは
-- size_class は仮値 'M' を入れ、寸法だけ正確に入れる。INSERT 後に
-- calc_size_class_from_volume で notes='domestic-expansion' の行だけを確定させる
-- (元マイグレーションと同じ方式。size_class は手で決めず寸法から導出)。
-- 寸法は各車種の代表的な国内モデルの公表値ベース。世代差の誤差は体積しきい値が
-- 粗い (2㎥刻み) ため区分に吸収される。
-- 既存行と重複する (maker, model) は ON CONFLICT DO NOTHING で維持する。
-- ============================================================

INSERT INTO vehicle_size_master (maker, model, size_class, body_type, full_length_mm, full_width_mm, full_height_mm, notes) VALUES
-- ── トヨタ (絶版・現行gap) ──
('トヨタ', 'マークX', 'M', 'sedan', 4770, 1795, 1435, 'domestic-expansion'),
('トヨタ', 'マークII', 'M', 'sedan', 4760, 1760, 1440, 'domestic-expansion'),
('トヨタ', 'チェイサー', 'M', 'sedan', 4760, 1760, 1400, 'domestic-expansion'),
('トヨタ', 'ヴィッツ', 'M', 'hatchback', 3885, 1695, 1500, 'domestic-expansion'),
('トヨタ', 'bB', 'M', 'hatchback', 3835, 1690, 1635, 'domestic-expansion'),
('トヨタ', 'ラクティス', 'M', 'hatchback', 3995, 1695, 1585, 'domestic-expansion'),
('トヨタ', 'イスト', 'M', 'hatchback', 3930, 1725, 1530, 'domestic-expansion'),
('トヨタ', 'オーリス', 'M', 'hatchback', 4330, 1760, 1480, 'domestic-expansion'),
('トヨタ', 'ブレイド', 'M', 'hatchback', 4270, 1760, 1515, 'domestic-expansion'),
('トヨタ', 'ポルテ', 'M', 'van', 3995, 1695, 1690, 'domestic-expansion'),
('トヨタ', 'スペイド', 'M', 'van', 3995, 1695, 1690, 'domestic-expansion'),
('トヨタ', 'タンク', 'M', 'van', 3700, 1670, 1735, 'domestic-expansion'),
('トヨタ', 'プロボックス', 'M', 'van', 4245, 1690, 1525, 'domestic-expansion'),
('トヨタ', 'サクシード', 'M', 'van', 4300, 1690, 1525, 'domestic-expansion'),
('トヨタ', 'カローラフィールダー', 'M', 'wagon', 4400, 1695, 1475, 'domestic-expansion'),
('トヨタ', 'カローラアクシオ', 'M', 'sedan', 4400, 1695, 1460, 'domestic-expansion'),
('トヨタ', 'プレミオ', 'M', 'sedan', 4595, 1695, 1475, 'domestic-expansion'),
('トヨタ', 'アリオン', 'M', 'sedan', 4595, 1695, 1470, 'domestic-expansion'),
('トヨタ', 'ウィッシュ', 'M', 'van', 4590, 1695, 1590, 'domestic-expansion'),
('トヨタ', 'アイシス', 'M', 'van', 4410, 1695, 1660, 'domestic-expansion'),
('トヨタ', 'エスティマ', 'M', 'van', 4820, 1800, 1760, 'domestic-expansion'),
('トヨタ', 'ランドクルーザープラド', 'M', 'suv', 4825, 1885, 1890, 'domestic-expansion'),
('トヨタ', 'ハイラックス', 'M', 'truck', 5325, 1855, 1810, 'domestic-expansion'),
('トヨタ', 'FJクルーザー', 'M', 'suv', 4635, 1905, 1840, 'domestic-expansion'),
('トヨタ', 'スープラ', 'M', 'sports', 4520, 1810, 1275, 'domestic-expansion'),
('トヨタ', 'ソアラ', 'M', 'sports', 4660, 1825, 1410, 'domestic-expansion'),
('トヨタ', 'セルシオ', 'M', 'sedan', 4995, 1830, 1470, 'domestic-expansion'),
('トヨタ', 'プリウスα', 'M', 'wagon', 4615, 1775, 1575, 'domestic-expansion'),
('トヨタ', 'SAI', 'M', 'sedan', 4720, 1770, 1495, 'domestic-expansion'),
('トヨタ', 'MIRAI', 'M', 'sedan', 4975, 1885, 1470, 'domestic-expansion'),
('トヨタ', 'C-HR', 'M', 'suv', 4360, 1795, 1565, 'domestic-expansion'),
('トヨタ', 'レジアスエース', 'M', 'van', 4695, 1695, 1980, 'domestic-expansion'),
-- ── 日産 ──
('日産', 'マーチ', 'M', 'hatchback', 3825, 1665, 1515, 'domestic-expansion'),
('日産', 'キューブ', 'M', 'hatchback', 3890, 1695, 1650, 'domestic-expansion'),
('日産', 'ティーダ', 'M', 'hatchback', 4205, 1695, 1535, 'domestic-expansion'),
('日産', 'ジューク', 'M', 'suv', 4135, 1765, 1565, 'domestic-expansion'),
('日産', 'デュアリス', 'M', 'suv', 4315, 1780, 1615, 'domestic-expansion'),
('日産', 'ムラーノ', 'M', 'suv', 4890, 1885, 1725, 'domestic-expansion'),
('日産', 'ラフェスタ', 'M', 'van', 4520, 1695, 1615, 'domestic-expansion'),
('日産', 'プレサージュ', 'M', 'van', 4825, 1795, 1730, 'domestic-expansion'),
('日産', 'キャラバン', 'M', 'van', 4695, 1695, 1990, 'domestic-expansion'),
('日産', 'NV200バネット', 'M', 'van', 4400, 1695, 1855, 'domestic-expansion'),
('日産', 'ADバン', 'M', 'van', 4395, 1695, 1500, 'domestic-expansion'),
('日産', 'ウイングロード', 'M', 'wagon', 4420, 1695, 1500, 'domestic-expansion'),
('日産', 'シルフィ', 'M', 'sedan', 4615, 1760, 1495, 'domestic-expansion'),
('日産', 'ティアナ', 'M', 'sedan', 4865, 1830, 1490, 'domestic-expansion'),
('日産', 'フーガ', 'M', 'sedan', 4945, 1845, 1500, 'domestic-expansion'),
('日産', 'シーマ', 'M', 'sedan', 5120, 1845, 1510, 'domestic-expansion'),
('日産', 'セドリック', 'M', 'sedan', 4930, 1770, 1445, 'domestic-expansion'),
('日産', 'グロリア', 'M', 'sedan', 4930, 1770, 1445, 'domestic-expansion'),
('日産', 'ローレル', 'M', 'sedan', 4770, 1730, 1425, 'domestic-expansion'),
('日産', 'ステージア', 'M', 'wagon', 4720, 1755, 1475, 'domestic-expansion'),
('日産', 'シルビア', 'M', 'sports', 4445, 1695, 1285, 'domestic-expansion'),
('日産', 'スカイラインGT-R', 'M', 'sports', 4600, 1785, 1360, 'domestic-expansion'),
('日産', 'サクラ', 'M', 'kei', 3395, 1475, 1655, 'domestic-expansion'),
('日産', 'テラノ', 'M', 'suv', 4585, 1735, 1780, 'domestic-expansion'),
-- ── ホンダ ──
('ホンダ', 'シャトル', 'M', 'wagon', 4400, 1695, 1545, 'domestic-expansion'),
('ホンダ', 'グレイス', 'M', 'sedan', 4440, 1695, 1475, 'domestic-expansion'),
('ホンダ', 'インサイト', 'M', 'sedan', 4675, 1725, 1410, 'domestic-expansion'),
('ホンダ', 'CR-Z', 'M', 'sports', 4080, 1740, 1395, 'domestic-expansion'),
('ホンダ', 'ジェイド', 'M', 'wagon', 4660, 1775, 1530, 'domestic-expansion'),
('ホンダ', 'ストリーム', 'M', 'van', 4570, 1795, 1545, 'domestic-expansion'),
('ホンダ', 'エリシオン', 'M', 'van', 4920, 1845, 1790, 'domestic-expansion'),
('ホンダ', 'モビリオ', 'M', 'van', 4055, 1685, 1680, 'domestic-expansion'),
('ホンダ', 'エアウェイブ', 'M', 'wagon', 4310, 1695, 1550, 'domestic-expansion'),
('ホンダ', 'シビックタイプR', 'M', 'hatchback', 4595, 1890, 1405, 'domestic-expansion'),
('ホンダ', 'インテグラ', 'M', 'coupe', 4530, 1725, 1360, 'domestic-expansion'),
('ホンダ', 'プレリュード', 'M', 'coupe', 4520, 1750, 1290, 'domestic-expansion'),
('ホンダ', 'S2000', 'M', 'sports', 4135, 1750, 1285, 'domestic-expansion'),
('ホンダ', 'ビート', 'M', 'sports', 3295, 1395, 1175, 'domestic-expansion'),
('ホンダ', 'エレメント', 'M', 'suv', 4300, 1815, 1790, 'domestic-expansion'),
('ホンダ', 'ライフ', 'M', 'kei', 3395, 1475, 1610, 'domestic-expansion'),
('ホンダ', 'ゼスト', 'M', 'kei', 3395, 1475, 1635, 'domestic-expansion'),
('ホンダ', 'バモス', 'M', 'kei', 3395, 1475, 1800, 'domestic-expansion'),
('ホンダ', 'アクティ', 'M', 'kei', 3395, 1475, 1800, 'domestic-expansion'),
('ホンダ', 'N-VAN', 'M', 'kei', 3395, 1475, 1945, 'domestic-expansion'),
-- ── マツダ ──
('マツダ', 'デミオ', 'M', 'hatchback', 4060, 1695, 1500, 'domestic-expansion'),
('マツダ', 'ベリーサ', 'M', 'hatchback', 4145, 1690, 1520, 'domestic-expansion'),
('マツダ', 'プレマシー', 'M', 'van', 4585, 1750, 1615, 'domestic-expansion'),
('マツダ', 'ビアンテ', 'M', 'van', 4715, 1770, 1835, 'domestic-expansion'),
('マツダ', 'MPV', 'M', 'van', 4860, 1850, 1685, 'domestic-expansion'),
('マツダ', 'ボンゴ', 'M', 'van', 4450, 1690, 1970, 'domestic-expansion'),
('マツダ', 'RX-7', 'M', 'sports', 4285, 1760, 1230, 'domestic-expansion'),
('マツダ', 'RX-8', 'M', 'sports', 4470, 1770, 1340, 'domestic-expansion'),
('マツダ', 'ファミリア', 'M', 'hatchback', 4290, 1680, 1420, 'domestic-expansion'),
('マツダ', 'CX-80', 'M', 'suv', 4990, 1890, 1710, 'domestic-expansion'),
('マツダ', 'フレアワゴン', 'M', 'kei', 3395, 1475, 1785, 'domestic-expansion'),
('マツダ', 'キャロル', 'M', 'kei', 3395, 1475, 1500, 'domestic-expansion'),
('マツダ', 'スクラム', 'M', 'kei', 3395, 1475, 1875, 'domestic-expansion'),
-- ── スバル ──
('スバル', 'レガシィB4', 'M', 'sedan', 4795, 1780, 1505, 'domestic-expansion'),
('スバル', 'レガシィアウトバック', 'M', 'wagon', 4870, 1875, 1670, 'domestic-expansion'),
('スバル', 'WRX STI', 'M', 'sedan', 4595, 1795, 1475, 'domestic-expansion'),
('スバル', 'エクシーガ', 'M', 'van', 4740, 1775, 1660, 'domestic-expansion'),
('スバル', 'トレジア', 'M', 'hatchback', 3990, 1695, 1550, 'domestic-expansion'),
('スバル', 'ジャスティ', 'M', 'van', 3995, 1695, 1705, 'domestic-expansion'),
('スバル', 'ステラ', 'M', 'kei', 3395, 1475, 1670, 'domestic-expansion'),
('スバル', 'プレオ', 'M', 'kei', 3395, 1475, 1600, 'domestic-expansion'),
('スバル', 'サンバー', 'M', 'kei', 3395, 1475, 1875, 'domestic-expansion'),
-- ── スズキ ──
('スズキ', 'スイフトスポーツ', 'M', 'hatchback', 3890, 1735, 1500, 'domestic-expansion'),
('スズキ', 'バレーノ', 'M', 'hatchback', 3995, 1745, 1470, 'domestic-expansion'),
('スズキ', 'イグニス', 'M', 'suv', 3700, 1660, 1595, 'domestic-expansion'),
('スズキ', 'SX4', 'M', 'suv', 4135, 1755, 1585, 'domestic-expansion'),
('スズキ', 'キザシ', 'M', 'sedan', 4650, 1820, 1480, 'domestic-expansion'),
('スズキ', 'ランディ', 'M', 'van', 4685, 1695, 1865, 'domestic-expansion'),
('スズキ', 'アルトラパン', 'M', 'kei', 3395, 1475, 1525, 'domestic-expansion'),
('スズキ', 'ワゴンRスマイル', 'M', 'kei', 3395, 1475, 1695, 'domestic-expansion'),
('スズキ', 'エブリイ', 'M', 'kei', 3395, 1475, 1815, 'domestic-expansion'),
('スズキ', 'エブリイワゴン', 'M', 'kei', 3395, 1475, 1910, 'domestic-expansion'),
('スズキ', 'キャリイ', 'M', 'kei', 3395, 1475, 1765, 'domestic-expansion'),
('スズキ', 'MRワゴン', 'M', 'kei', 3395, 1475, 1620, 'domestic-expansion'),
-- ── ダイハツ ──
('ダイハツ', 'ムーヴキャンバス', 'M', 'kei', 3395, 1475, 1655, 'domestic-expansion'),
('ダイハツ', 'ムーヴコンテ', 'M', 'kei', 3395, 1475, 1610, 'domestic-expansion'),
('ダイハツ', 'ミラトコット', 'M', 'kei', 3395, 1475, 1530, 'domestic-expansion'),
('ダイハツ', 'ミラジーノ', 'M', 'kei', 3395, 1475, 1425, 'domestic-expansion'),
('ダイハツ', 'ウェイク', 'M', 'kei', 3395, 1475, 1835, 'domestic-expansion'),
('ダイハツ', 'ブーン', 'M', 'hatchback', 3700, 1665, 1525, 'domestic-expansion'),
('ダイハツ', 'ハイゼットカーゴ', 'M', 'kei', 3395, 1475, 1875, 'domestic-expansion'),
('ダイハツ', 'ハイゼットトラック', 'M', 'kei', 3395, 1475, 1780, 'domestic-expansion'),
('ダイハツ', 'アトレー', 'M', 'kei', 3395, 1475, 1890, 'domestic-expansion'),
('ダイハツ', 'アルティス', 'M', 'sedan', 4825, 1825, 1470, 'domestic-expansion'),
('ダイハツ', 'ビーゴ', 'M', 'suv', 4030, 1695, 1720, 'domestic-expansion'),
-- ── 三菱 ──
('三菱', 'ミラージュ', 'M', 'hatchback', 3845, 1665, 1505, 'domestic-expansion'),
('三菱', 'コルト', 'M', 'hatchback', 3860, 1680, 1550, 'domestic-expansion'),
('三菱', 'ランサー', 'M', 'sedan', 4570, 1760, 1490, 'domestic-expansion'),
('三菱', 'ランサーエボリューション', 'M', 'sedan', 4510, 1810, 1480, 'domestic-expansion'),
('三菱', 'デリカD:2', 'M', 'van', 3710, 1670, 1745, 'domestic-expansion'),
('三菱', 'デリカD:3', 'M', 'van', 4390, 1695, 1875, 'domestic-expansion'),
('三菱', 'パジェロ', 'M', 'suv', 4900, 1875, 1900, 'domestic-expansion'),
('三菱', 'パジェロミニ', 'M', 'kei', 3395, 1475, 1550, 'domestic-expansion'),
('三菱', 'eKスペース', 'M', 'kei', 3395, 1475, 1780, 'domestic-expansion'),
('三菱', 'トッポ', 'M', 'kei', 3395, 1475, 1800, 'domestic-expansion'),
('三菱', 'タウンボックス', 'M', 'kei', 3395, 1475, 1815, 'domestic-expansion'),
('三菱', 'ミニキャブ', 'M', 'kei', 3395, 1475, 1915, 'domestic-expansion'),
('三菱', 'ギャラン', 'M', 'sedan', 4670, 1740, 1420, 'domestic-expansion'),
('三菱', 'ディアマンテ', 'M', 'sedan', 4900, 1785, 1420, 'domestic-expansion'),
('三菱', 'GTO', 'M', 'sports', 4555, 1840, 1285, 'domestic-expansion')
ON CONFLICT (maker, model) DO NOTHING;

-- 寸法から size_class を再計算 (体積 = 全長×全幅×全高 / 1e9 ㎥)。
-- 今回追加分 (notes='domestic-expansion') だけを対象にし、既存行には触れない。
UPDATE vehicle_size_master
SET size_class = calc_size_class_from_volume(
  ROUND((full_length_mm::numeric * full_width_mm::numeric * full_height_mm::numeric) / 1000000000, 2)
)
WHERE notes = 'domestic-expansion'
  AND full_length_mm IS NOT NULL
  AND full_width_mm IS NOT NULL
  AND full_height_mm IS NOT NULL;
