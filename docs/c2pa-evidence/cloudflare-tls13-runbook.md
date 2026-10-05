# Cloudflare を前段に置いて TLS 1.3 を必須にする手順（C2PA GPSA O.5 対応）

- 目的: C2PA Conformance の GPSA レビュー O.5「サブシステム間通信は TLS 1.3 以上を必須にせよ」を満たす。
- 背景: Vercel 単体では TLS 1.2 を拒否できない（2026-09-29、Vercel の回答で確定）。
- 方針（代表決定 2026-09-29）: `ledra.co.jp` を Cloudflare 経由にし、Cloudflare 側で「最低 TLS 1.3」を強制する。
- 作業者: 代表（Cloudflare・ドメイン登録業者・Vercel の管理画面の操作）。コード側の準備は済み（下の §4）。

---

## 0. 始める前に（重要）

- **今の DNS レコードを全部控える。** Cloudflare にネームサーバーを移すと、写していないレコードは消える。
  特にメール（MX・SPF/DKIM/DMARC の TXT）、Google/Vercel/Supabase の確認用 TXT、サブドメインの CNAME。
  控える場所はドメインを買った業者（または今の DNS 管理先）の管理画面。
- 作業は利用の少ない時間帯に行う。切り替えの反映には数分〜数時間かかる。
- モバイルアプリの API 接続先（`EXPO_PUBLIC_API_URL`）が **`https://www.ledra.co.jp` などの独自ドメイン**
  になっていることを確認する（`apps/mobile/eas.json` では `https://app.ledra.co.jp`。§1 で `app` を Proxied にすること）。`*.vercel.app` を向いていると Cloudflare を通らず、写真アップロードが拒否される（§4）。

## 1. Cloudflare にドメインを追加する

1. Cloudflare（無料プラン可）で「サイトを追加」→ `ledra.co.jp`。
2. Cloudflare が取り込んだ DNS レコードを、§0 で控えた一覧と突き合わせる。足りないものは手で追加する。
3. Vercel 向けのレコードは **オレンジ雲（Proxied）** にする。例:
   - `www` → CNAME `cname.vercel-dns.com`（Proxied）
   - **`app`** → Vercel 向け CNAME（Proxied）。Web アプリとモバイル（`apps/mobile/eas.json` の `EXPO_PUBLIC_API_URL`）はこちらを使う。
   - `@`（apex）→ Vercel が指定する A レコード（Proxied）
   - メール関連（MX 等）は Proxy 不可なので灰色雲のまま。
4. ドメイン業者の管理画面で、ネームサーバーを Cloudflare が指定する2つに変更する。

## 2. Cloudflare の TLS 設定

1. SSL/TLS → Overview: 暗号化モードを **Full (strict)** にする。Vercel は正規の証明書を持つため strict でよい。
2. SSL/TLS → Edge Certificates:
   - **Minimum TLS Version = TLS 1.3**
   - **Always Use HTTPS = On**
   - TLS 1.3 = On
3. Caching → Cache Rules: `ledra.co.jp` 全体を **Bypass cache** にする。キャッシュは Vercel 側に任せ、Cloudflare では持たない。
4. Rules → Transform Rules → **Modify Request Header** を1本作る:
   - 対象: すべての受信リクエスト
   - 操作: Set static — ヘッダー名 `x-ledra-origin-secret`、値は **長いランダム文字列**。
     例: パスワード生成で作った40文字以上。**この値は誰にも見せない。**

## 3. Vercel の設定

Settings → Environment Variables（Production）に次を追加して、再デプロイする。

| 名前               | 値                | 意味                                                                                                               |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CF_ORIGIN_SECRET` | §2-4 と同じ文字列 | 写真アップロードを Cloudflare 経由（TLS 1.3）だけに限る                                                            |
| `TRUST_CF_HEADERS` | `1`               | レート制限が利用者の本当の IP（`cf-connecting-ip`）を使うようにする（`CF_ORIGIN_SECRET` が一致するリクエストだけ） |

- Backend → Supabase の TLS 1.3 はコード側で強制済み（`src/lib/net/tls13Fetch.ts`、サーバー側の Supabase
  クライアント全部）。`NODE_OPTIONS=--tls-min-v1.3` は**入れない**（Stripe・LINE など他の連携まで巻き込むため）。
- **`TRUST_CF_HEADERS` は `CF_ORIGIN_SECRET` とセット**で入れる。秘密ヘッダが一致しないリクエスト
  （`*.vercel.app` への直アクセスなど）の `cf-connecting-ip` はコード側で無視するので、偽の IP でレート制限を
  すり抜けることはできない。`CF_ORIGIN_SECRET` を入れずに `TRUST_CF_HEADERS=1` だけ入れても何も変わらない。
- **推奨**: Settings → Deployment Protection で、`*.vercel.app` の URL を保護する設定
  （Standard Protection など）を有効にする。写真アップロードとレート制限は上の照合で守られるが、
  それ以外の画面は `*.vercel.app` から TLS 1.2 で開けてしまうため。

## 4. コード側（準備済み・この PR）

- `src/lib/certificateImages/uploadHandler.ts` の `viaTls13Edge`:
  - `CF_ORIGIN_SECRET` が設定されていると、写真アップロード（Web・モバイル共通）は `x-ledra-origin-secret` が
    一致するときだけ受け付ける。一致しなければ 403。
  - `*.vercel.app` への直アクセス（TLS 1.2 で通れる）で C2PA の対象経路に入ることを防ぐ。
  - 未設定のあいだは何もしない。**DNS 切り替え前に本番へ出しても影響はない。**
- `src/lib/rateLimit.ts` の `getClientIp`: `TRUST_CF_HEADERS=1` でも、秘密ヘッダが一致するときだけ
  `cf-connecting-ip` を使う。照合は `src/lib/edgeOrigin.ts` の `fromCloudflareEdge`（両方で共有）。
- テスト: `src/lib/__tests__/edgeOrigin.test.ts`、`src/lib/__tests__/rateLimit.test.ts`、
  `src/lib/certificateImages/__tests__/viaTls13Edge.test.ts`

## 5. 確認（代表の PC で）

1. ブラウザで `https://app.ledra.co.jp` が開き、ログインと写真アップロードができる。モバイルアプリからも写真アップロードができる。
2. TLS 1.2 で接続できないことを確かめる（Mac / Linux のターミナル）:
   ```sh
   # app / www / apex の3つとも。Windows の PowerShell では curl.exe と書く
   curl -sI --tls-max 1.2 https://app.ledra.co.jp   # 失敗すれば OK（exit 35 等）
   curl -sI --tlsv1.3 https://app.ledra.co.jp       # 200 等と Server: cloudflare が返れば OK
   ```
   または SSL Labs（https://www.ssllabs.com/ssltest/）で `app.ledra.co.jp`・`www.ledra.co.jp` を検査し、「TLS 1.2: No」「TLS 1.3: Yes」を確認する。
3. 結果（コマンドの出力か SSL Labs の画面）を Claude に貼る。GPSA の O.5 を、実際の構成に合わせて書き直す。
