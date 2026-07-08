# 日本の自動車業界で Ledra が解ける課題 — 最新統計と機能マッピング (2026-07)

> 目的: 「Ledra の現状のコード・機能」を起点に、日本の自動車アフターマーケットで
> 今まさに起きている課題を最新の公開統計で棚卸しし、**どの課題を Ledra のどの実装が
> 解くのか**を一枚に固定する。既存の縦別監査 (`docs/clerical-gap-audit-*.md`) が
> “社内業務ギャップ” 視点なのに対し、本書は **“外部の業界課題 × 最新統計 × Ledra 機能”**
> 視点で補完する。ピッチ・営業・ロードマップ優先度付けの共通ソースとして使う。
>
> 注: 数値は 2026-07 時点の公開情報。各節末に出典 URL を付す。強度評価は
> ◎ = コア (現状コードが直接解く) / ○ = 有効 (再利用で解ける) / △ = 限定的
> (Ledra 単体では埋まらない、主戦場にしない)。

## 全体所見

Ledra の中核資産は **改ざんできない施工証明** — SHA-256 → Merkle 木 → Polygon
アンカリング (`src/lib/anchoring/`) と RFC3161 TSA タイムスタンプ
(`src/lib/parts/tsa.ts` / `src/lib/parts/rfc3161.ts`)、写真必須ゲート
(`src/lib/certificates/photoRequirement.ts`)、AI 写真改ざん検知、保険会社ポータル
(`src/app/insurer/`)、Vehicle Passport (`src/app/passport/`)。

この資産に対し、業界側では **「制度・不正・後継者」という“待ったなし”の外圧** が
同時進行で需要を作っている。結論を先に言うと、**最大の勝ち筋は下表 ③(透明性) ×
④(記録簿電子化の制度追い風) の交差点**。①(省力化) と ⑤(中古流通) がそこに接続する。
⑥(EV/ADAS) は正直 Ledra の直接解ではないので主戦場にしない。

| # | 課題 | 需要のドライバー | Ledra 強度 |
|---|---|---|---|
| ① | 整備士不足・高齢化 | 構造的な供給不足 | ○ |
| ② | 倒産・廃業・後継者不在 | 経営環境の悪化 | ○ |
| ③ | ビッグモーター後の透明性・信頼要求 | **不正・行政処分・規制** | **◎ 本丸** |
| ④ | 点検整備記録簿の電子化“解禁” | **制度改正 (2025-07)** | **◎ 追い風** |
| ⑤ | 中古車のトレーサビリティ断絶 | 走行距離・履歴の不正 | ○ |
| ⑥ | EV/ADAS 整備の対応力不足 | 電動化 | △ |

---

## ① 整備士の人手不足・高齢化 〔強度: ○〕

需要は過去最高水準なのに、担い手の供給が構造的に崩れている。

- **有効求人倍率 5.45倍**(令和6年度) — 全産業平均 **1.25倍** の約4倍。
- 整備士の **平均年齢 47.4歳**、民間整備工場では **51.9歳**。
- 養成校入学者は **2003年度 約12,000人 → 2023年度 約6,800人(半減)**。10年で整備士 約9,439人減。
- 一方で保有台数は **約8,270万台**、平均使用年数 **17.0年(29年連続で高齢化)** → 整備需要は高止まり。

**Ledra の解**: 「入力は AI が消す」。証明書・記録・請求の入力自動化 (`src/lib/ai/`、
40+ の構造化出力タスク＋自動アクション) で、少ない人員でも回る省力化。国交省も 2025年に
「省力化投資促進プラン ―自動車整備業―」を公表しており、省力化 SaaS は補助・政策の追い風。
物理的な整備そのものは代替できないため強度は ○。

出典: [有効求人倍率・平均年齢(seibishi.me)](https://seibishi.me/blog/mechanic-husoku/) /
[整備士の現状(and-pro)](https://automotive.and-pro.jp/mechanic/articles/13/) /
[養成校入学者・NRI](https://www.nri.com/jp/media/column/scs_blog/20250530.html) /
[国交省 人材確保PDF](https://www.mlit.go.jp/koku/content/001729973.pdf) /
[国交省 省力化投資促進プラン](https://www.cas.go.jp/jp/seisaku/atarashii_sihonsyugi/shouryokukatousi/05-1.pdf)

---

## ② 整備事業者の倒産・廃業が過去最多／後継者不在 〔強度: ○〕

「安定需要があるのに退場が過去最悪ペース」という業界。

- **2024年度: 休廃業・解散 382件(過去最多)、倒産(負債1000万円以上)63件、合計 445件が消滅**(帝国データバンク)。前年度334件から約15%増。
- **赤字 26.2%**、減益含む「業績悪化」企業は **52.9%** と過半。
- **経営者の 57.0% が60歳以上**、**後継者不在率 59.7%**。人件費・部品仕入高騰、保険修理の単価低迷が圧迫。

**Ledra の解**: (a) 業務一元化 (顧客・車両・予約・POS・請求・在庫) での省力化、
(b) コーティング/PPF/膜厚レポート等の **高付加価値・高単価** メニューへの多角化、
(c) 事業承継・M&A 時に **整備履歴・顧客・車両を“可視化された譲渡可能資産”** として
引き継げる (`vehicle_histories` / `vehicle_passports`)。データが承継価値になる。

出典: [TDB 倒産・休廃業2024年度](https://www.tdb.co.jp/report/industry/250504_seibi25fy/) /
[Response 445件消滅](https://response.jp/article/2025/05/05/395323.html) /
[TDB プレスリリース(後継者不在)](https://prtimes.jp/main/html/rd/p/000000914.000043465.html)

---

## ③ ビッグモーター後の「透明性・信頼」要求 〔強度: ◎ 本丸〕

2023年のビッグモーター事件を契機に、業界全体が「事後に証明できる記録」を求める構造に転換した。

- **損保大手4社が約 6.5万件を不正認定** (Ledra 試算で ≈ **¥39,000/台**)。
- 国交省が **板金塗装の作業前・作業中・作業後の写真保存を指針化(2024)**、
  さらに **組織的な法令違反に対し法人全体を処分できるルール** を新設。
- **損保ジャパンが 2025年4月に不正専門部署を新設＋不正請求検知システム(米EIS Group)を導入**。
- **令和7年 保険業法改正(2026-06-01施行)** で、整備と保険代理を兼ねる **兼業代理店の規制を強化**(まさにビッグモーター型の利益相反対策)。

**Ledra の解**: これが現状コードのど真ん中。
- 改ざん不能な施工証明: `src/lib/anchoring/` (SHA-256 → Merkle → Polygon)、
  真正性グレード (`authenticityGrade.ts`)、AI 写真改ざん検知 (Photoshop 痕跡/未来日付/使い回し/GPS 矛盾)、C2PA。
- **写真は証明書発行の必須ゲート** (`src/lib/certificates/photoRequirement.ts`) — 国交省の「作業前中後の写真」指針と要件が一致。
- 保険会社ポータル (`src/app/insurer/`): 証明書即時照会・不正フラグ・案件管理。
- 兼業代理店規制へは **保険 Pre-check ポータル** 構想 (`docs/insurance-precheck-proposal.md`) が e-署名＋RFC3161＋アンカリングで“改ざん不能な募集記録”を提供。

出典: [日経 整備写真保存指針](https://www.nikkei.com/article/DGXZQOUE054AA0V00C24A3000000/) /
[損保ジャパン 不正請求防止PDF](https://www.sompo-japan.co.jp/-/media/SJNK/files/news/2024/20250123_1.pdf) /
[2025年の整備業界・法令順守(日本自動車会議所)](https://www.aba-j.or.jp/info/industry/23585/) /
[ビッグモーター事件が変えた整備業界(note)](https://note.com/id_yoshino/n/nc8e5899f47ea)

---

## ④ 制度追い風: 点検整備記録簿の「電子化解禁」 〔強度: ◎ 追い風〕

Ledra の技術要件と制度改正の方向が一致した、稀有なタイミング。

- **2025年7月8日、国交省が「電子」点検整備記録簿を解禁**。従来ユーザーは紙の記録簿を車載保管する義務があり、ディーラー/工場側は電子管理済みでも**紙を交付する“二重管理”**が続いていた。これが解消。
- 電子車検証(IC 化)は **2023年1月〜(軽自動車は2024年〜)**。指定工場は OSS + IC リーダーで運輸支局への出頭なしに更新可能に。
- 電子帳簿保存法は「**改ざん防止できるシステムを使えばタイムスタンプ付与自体が不要**(真実性の確保)」と整理。

**Ledra の解**: 電子保存 × **RFC3161 TSA** (`src/lib/parts/tsa.ts` / `rfc3161.ts`、
JIPDEC 認定局の CMS トークンを保管) × アンカリングによる改ざん耐性は、
「電子記録簿を、後から改ざんできない形で残す」需要そのもの。制度改正がそのまま
導入トリガーになる。

出典: [電子記録簿の解禁(note)](https://note.com/id_yoshino/n/n399061406788) /
[TASPA 電子記録簿PDF](https://www.taspa.or.jp/wp-content/uploads/2025/07/seibijigyokisei_05.pdf) /
[電子車検証(DNP)](https://www.dnp.co.jp/biz/column/detail/20172199_4969.html) /
[電帳法タイムスタンプ2025(delta-biz)](https://delta-biz.jp/column/842/)

---

## ⑤ 中古車のトレーサビリティ断絶(走行距離・整備履歴) 〔強度: ○〕

- メーター改ざんは ECU 履歴やデジタルフォレンジックで露見しやすくなったが、
  **輸出・オートオークション間の移動で履歴の連続性が切れやすい**(海外経由車で顕著)。
- 日本オートオークション協議会の「走行メーター管理システム」は AA 出品車の距離を集中管理するが、**国際取引・輸出段のトレーサビリティは課題として残存**。

**Ledra の解**: **Vehicle Passport** (`src/app/passport/`、`passport_ownership_transfers`
= `supabase/migrations/20260522000000_passport_ownership_transfers.sql`、従量課金の検証 API)
で VIN 単位に整備・施工履歴と所有権移転を連結し、改ざん耐性のある“連続した履歴”を担保。
中古車マーケット (`src/app/market/`) と接続すれば流通面の価値になる。

出典: [走行メーター管理システム(自動車公正取引協議会)](https://www.aftc.or.jp/sp/am/meter/meter_1.html) /
[メーター改ざんとデジタルフォレンジック(MotorFan)](https://motor-fan.jp/article/784261/)

---

## ⑥ (参考) EV/ADAS 整備の対応力不足 〔強度: △ — 主戦場にしない〕

- 政府は **2035年までに乗用車新車販売で電動車100%** を目標。次期意向車の
  HEV+PHEV+BEV+FCEV 意向計は4割台半ば。
- 平均車齢 17年で保有が高齢化する一方、街の整備工場は **電装系・センサー系(ADAS)整備の
  対応力不足** から受け入れできず、**正規ディーラーへ顧客流出** するケースが少なくない。

**正直な評価**: 物理的な整備スキルギャップは **Ledra では埋まらない**。関連するのは
「正規部品の装着証明」(部品インテグリティ `src/lib/parts/`) と academy(LMS) による
手順標準化のみ。ここは主戦場にせず、③④⑤ の証明レイヤーに集中するのが妥当。

出典: [国交省 数字でみる自動車2025](https://www.mlit.go.jp/jidosha/jidosha_fr1_000096.html) /
[JAMA 2025年度乗用車市場動向調査](https://www.jama.or.jp/release/news_release/2026/3582/) /
[TDB(電動車・ADAS対応力)](https://www.tdb.co.jp/report/industry/250504_seibi25fy/)

---

## 課題 → Ledra 実装マッピング

| 課題 | Ledra の対応 | 主な実装/根拠 | 強度 |
|---|---|---|---|
| ① 整備士不足・省力化 | ✅ AI 入力自動化・業務一元化 | `src/lib/ai/`、`src/app/admin/jobs/` | ○ |
| ② 倒産・廃業・承継 | ⚠️ 多角化・履歴の資産化(承継 UI は未整備) | `vehicle_histories`、`vehicle_passports`、coating/PPF/thickness 系 | ○ |
| ③ 透明性・不正対策 | ✅ 改ざん不能証明・写真ゲート・保険ポータル | `src/lib/anchoring/`、`src/lib/certificates/photoRequirement.ts`、`src/app/insurer/` | ◎ |
| ④ 記録簿電子化 | ✅ 電子保存＋TSA＋改ざん耐性 | `src/lib/parts/tsa.ts`、`src/lib/parts/rfc3161.ts` | ◎ |
| ⑤ 中古トレーサビリティ | ✅ Vehicle Passport・検証 API | `src/app/passport/`、`passport_ownership_transfers`、`src/app/market/` | ○ |
| ⑥ EV/ADAS 整備スキル | ❌ Ledra 外(部品インテグリティ/LMS のみ関連) | `src/lib/parts/`、academy | △ |

凡例: ✅ = 現状コードが直接解く / ⚠️ = 一部は再利用可だが専用フロー未整備 / ❌ = スコープ外

## 結論

**③(透明性) × ④(記録簿電子化) が Ledra の中核勝ち筋**。②③④は制度・不正・後継者という
外圧が需要を生んでおり、現状のアンカリング/TSA/写真ゲート/保険ポータル/Passport と最も
噛み合う。①(省力化) と ⑤(中古流通) をそこに接続する。⑥ は主戦場にしない。

## 出典一覧

- 整備士不足・求人倍率: https://seibishi.me/blog/mechanic-husoku/ , https://automotive.and-pro.jp/mechanic/articles/13/
- 養成校入学者・NRI: https://www.nri.com/jp/media/column/scs_blog/20250530.html
- 国交省(人材確保/省力化/数字でみる自動車2025): https://www.mlit.go.jp/koku/content/001729973.pdf , https://www.cas.go.jp/jp/seisaku/atarashii_sihonsyugi/shouryokukatousi/05-1.pdf , https://www.mlit.go.jp/jidosha/jidosha_fr1_000096.html
- 倒産・廃業(TDB/Response): https://www.tdb.co.jp/report/industry/250504_seibi25fy/ , https://response.jp/article/2025/05/05/395323.html , https://prtimes.jp/main/html/rd/p/000000914.000043465.html
- ビッグモーター/写真保存/保険業法: https://www.nikkei.com/article/DGXZQOUE054AA0V00C24A3000000/ , https://www.sompo-japan.co.jp/-/media/SJNK/files/news/2024/20250123_1.pdf , https://www.aba-j.or.jp/info/industry/23585/ , https://note.com/id_yoshino/n/nc8e5899f47ea
- 記録簿電子化/電子車検証/電帳法: https://note.com/id_yoshino/n/n399061406788 , https://www.taspa.or.jp/wp-content/uploads/2025/07/seibijigyokisei_05.pdf , https://www.dnp.co.jp/biz/column/detail/20172199_4969.html , https://delta-biz.jp/column/842/
- 中古車トレーサビリティ: https://www.aftc.or.jp/sp/am/meter/meter_1.html , https://motor-fan.jp/article/784261/
- EV/ADAS: https://www.jama.or.jp/release/news_release/2026/3582/
