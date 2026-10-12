# デモ証明書の施工写真（AI 生成）

`setup-demo-tenant.ts` がデモテナント（Ledra Motors）の証明書写真として Storage に上げる画像。
**実在の施工の写真ではない**（2026-10-12 に Gamma の画像生成で作成。代表の判断、DECISION_LOG 同日）。

- フォルダ = 施工の種類。証明書との対応は `../demoPlaceholderImage.ts` の `DEMO_PHOTO_CATEGORY`。
- ファイル名順 = 作業の流れ（施工前 → 作業中 → 仕上がり）。証明書の i 枚目に i 番目を使い、足りなければ先頭に戻る。
  撮影用（`--filming`）の `anchored.jpg` は各フォルダの最後の1枚。
- 生成時の条件: ロゴ・エンブレム・ナンバー・読める文字・顔を入れない。目視で確認し、ロゴが写った1枚と
  不自然だった1枚は作り直した。
- 1280px 幅・JPEG（品質 78）。差し替えたら `npx tsx scripts/setup-demo-tenant.ts` を再実行する。撮影用データがあるときは
  先に `--filming-cleanup`（残っているとシードは何も書かずに止まる）、最後に `--filming` で作り直す。
