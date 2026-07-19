-- ============================================================
-- 車種サイズマスタ (vehicle_size_master) にアメ車を追加
-- 既存の 20260322000007_vehicle_size_master.sql はヨーロッパ車は網羅済みだが
-- アメリカ車 (フォード/シボレー/キャデラック/GMC/ダッジ/RAM/クライスラー/
-- リンカーン/ハマー等) が抜けていたため補完する。
--
-- size_class は寸法 (全長×全幅×全高) の体積から自動計算するため、ここでは
-- 代表寸法だけを入れ、INSERT 後に calc_size_class_from_volume で確定させる
-- (元マイグレーションと同じ方式。世代差の寸法誤差は体積しきい値が粗いため吸収される)。
-- 寸法は各車種の代表的な国内モデルの公表値ベース。
-- ============================================================

INSERT INTO vehicle_size_master (maker, model, size_class, body_type, full_length_mm, full_width_mm, full_height_mm, notes) VALUES
-- ── フォード ──
('フォード', 'マスタング', 'L', 'sports', 4790, 1915, 1400, 'US import'),
('フォード', 'マスタングマッハE', 'LL', 'suv', 4715, 1880, 1600, 'US import'),
('フォード', 'F-150', 'XL', 'truck', 5890, 2030, 1960, 'US import'),
('フォード', 'レンジャー', 'XL', 'truck', 5360, 1925, 1875, 'US import'),
('フォード', 'エクスプローラー', 'XL', 'suv', 5050, 2000, 1780, 'US import'),
('フォード', 'エクスペディション', 'XL', 'suv', 5335, 2030, 1935, 'US import'),
('フォード', 'ブロンコ', 'XL', 'suv', 4810, 1930, 1825, 'US import'),
-- ── シボレー ──
('シボレー', 'カマロ', 'L', 'sports', 4785, 1900, 1350, 'US import'),
('シボレー', 'コルベット', 'M', 'sports', 4630, 1935, 1230, 'US import'),
('シボレー', 'タホ', 'XL', 'suv', 5350, 2060, 1925, 'US import'),
('シボレー', 'サバーバン', 'XL', 'suv', 5730, 2060, 1925, 'US import'),
('シボレー', 'シルバラード', 'XL', 'truck', 5890, 2065, 1960, 'US import'),
('シボレー', 'ブレイザー', 'LL', 'suv', 4860, 1915, 1680, 'US import'),
('シボレー', 'トレイルブレイザー', 'L', 'suv', 4425, 1810, 1660, 'US import'),
-- ── ダッジ ──
('ダッジ', 'チャレンジャー', 'L', 'sports', 5020, 1920, 1450, 'US import'),
('ダッジ', 'チャージャー', 'LL', 'sedan', 5045, 1905, 1480, 'US import'),
('ダッジ', 'デュランゴ', 'XL', 'suv', 5075, 1925, 1800, 'US import'),
-- ── RAM ──
('RAM', '1500', 'XL', 'truck', 5900, 2085, 1960, 'US import'),
-- ── キャデラック ──
('キャデラック', 'エスカレード', 'XL', 'suv', 5400, 2065, 1950, 'US import'),
('キャデラック', 'XT5', 'LL', 'suv', 4815, 1900, 1685, 'US import'),
('キャデラック', 'XT6', 'XL', 'suv', 5060, 2000, 1785, 'US import'),
('キャデラック', 'CT5', 'L', 'sedan', 4930, 1885, 1455, 'US import'),
-- ── GMC ──
('GMC', 'シエラ', 'XL', 'truck', 5890, 2065, 1960, 'US import'),
('GMC', 'ユーコン', 'XL', 'suv', 5330, 2060, 1925, 'US import'),
-- ── クライスラー ──
('クライスラー', '300C', 'LL', 'sedan', 5045, 1905, 1495, 'US import'),
('クライスラー', 'パシフィカ', 'XL', 'van', 5180, 2020, 1780, 'US import'),
-- ── リンカーン ──
('リンカーン', 'ナビゲーター', 'XL', 'suv', 5335, 2075, 1940, 'US import'),
('リンカーン', 'アビエーター', 'XL', 'suv', 5060, 2015, 1760, 'US import'),
-- ── ハマー ──
('ハマー', 'H2', 'XL', 'suv', 5170, 2065, 1980, 'US import'),
('ハマー', 'H3', 'XL', 'suv', 4740, 1900, 1870, 'US import'),
-- ── テスラ (既存に無い車種を追加) ──
('テスラ', 'サイバートラック', 'XL', 'truck', 5680, 2200, 1790, 'US import'),
-- ── ジープ (既存に無い車種を追加) ──
('ジープ', 'グラディエーター', 'XL', 'truck', 5540, 1895, 1840, 'US import'),
('ジープ', 'ラングラーアンリミテッド', 'XL', 'suv', 4880, 1895, 1840, 'US import')
ON CONFLICT (maker, model) DO NOTHING;

-- 寸法から size_class を再計算 (体積 = 全長×全幅×全高 / 1e9 ㎥)。
-- notes='US import' の今回追加分だけを対象にし、既存行には触れない。
UPDATE vehicle_size_master
SET size_class = calc_size_class_from_volume(
  ROUND((full_length_mm::numeric * full_width_mm::numeric * full_height_mm::numeric) / 1000000000, 2)
)
WHERE notes = 'US import'
  AND full_length_mm IS NOT NULL
  AND full_width_mm IS NOT NULL
  AND full_height_mm IS NOT NULL;
