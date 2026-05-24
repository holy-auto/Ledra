import { PitchDeck, type Slide } from "../PitchDeck";

// ─── Slide chrome (light theme) ────────────────────────────────
const TOTAL = 15;

function S({ children, n }: { children: React.ReactNode; n: number }) {
  return (
    <div
      className="w-full h-full flex flex-col bg-white overflow-hidden"
      style={{ fontFamily: "var(--font-noto), var(--font-noto-sans), sans-serif" }}
    >
      <div className="h-[3px] w-full bg-gradient-to-r from-amber-500 to-orange-400 shrink-0" />
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      <div className="px-10 py-2.5 flex items-center justify-between border-t border-slate-200 shrink-0">
        <span className="text-slate-500 text-[11px] tracking-wide">Ledra — Confidential · 2026年5月</span>
        <span className="text-slate-500 text-[11px] font-mono">
          {n}/{TOTAL}
        </span>
      </div>
    </div>
  );
}

function Chip({
  children,
  color = "amber",
}: {
  children: React.ReactNode;
  color?: "amber" | "orange" | "green" | "rose" | "slate";
}) {
  const cls =
    color === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : color === "orange"
        ? "border-orange-300 bg-orange-50 text-orange-700"
        : color === "green"
          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
          : color === "rose"
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : "border-slate-300 bg-slate-50 text-slate-700";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-amber-600">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-extrabold text-slate-900 leading-snug">{children}</h2>;
}

// ─── 1. Cover ─────────────────────────────────────────────────
const S1 = (
  <S n={1}>
    <div className="flex flex-col items-center justify-center flex-1 text-center px-10 gap-5">
      <div className="flex gap-2 flex-wrap justify-center">
        <Chip>JAFCO SEED 2026</Chip>
        <Chip color="orange">株式会社HOLY</Chip>
        <Chip color="slate">2026年5月</Chip>
      </div>
      <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight text-slate-900">
        <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">Ledra</span>
      </h1>
      <p className="text-xl text-slate-900 max-w-2xl leading-relaxed font-semibold">職人の技術を、次へつなぐ。</p>
      <p className="text-sm text-slate-600 max-w-xl leading-relaxed">
        自動車整備・コーティング・PPF・板金塗装店向け
        <br />
        マルチテナント SaaS / WEB 施工証明書ネットワーク
      </p>
      <div className="mt-3 flex gap-6 text-xs text-slate-500">
        <span>代表取締役 堀越 友輔</span>
        <span>·</span>
        <span>ledra.co.jp</span>
        <span>·</span>
        <span>調達希望 ¥3,000万円</span>
      </div>
    </div>
  </S>
);

// ─── 2. Mission ─────────────────────────────────────────────────
const S2 = (
  <S n={2}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>ミッション</SectionLabel>
        <H2>「次へつなぐ」3つの軸</H2>
        <p className="text-sm text-slate-600 mt-1">職人の手仕事を、デジタル資産として 3 つの「次」へ承継する。</p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            icon: "📜",
            tag: "記録",
            title: "次の所有者へ",
            body: "紙の作業伝票で散逸していた施工記録を、改ざん不能なデジタル証明書として車両に紐づけ、次のオーナー・保険査定・中古車流通へ承継する。",
          },
          {
            icon: "🛠",
            tag: "技能",
            title: "次の職人へ",
            body: "ベテラン職人の暗黙知を、施工事例 + AI Q&A + 品質スコアで構造化し、次世代の施工技能教育プラットフォーム「Ledra Academy」へ承継する。",
          },
          {
            icon: "💎",
            tag: "価値",
            title: "次の市場へ",
            body: "施工で生まれた付加価値を、保険査定の客観指標 / 中古車流通時の再評価 / 顧客のLTV向上として、次の経済的価値へ承継する。",
          },
        ].map((item) => (
          <div key={item.tag} className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{item.icon}</span>
              <Chip color="amber">{item.tag}</Chip>
            </div>
            <h3 className="text-base font-bold text-slate-900 leading-snug">{item.title}</h3>
            <p className="text-xs text-slate-700 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  </S>
);

// ─── 3. Problem ─────────────────────────────────────────────────
const S3 = (
  <S n={3}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-4">
      <div>
        <SectionLabel>業界課題</SectionLabel>
        <H2>30万円の施工が、3年後に「なかったこと」になる。</H2>
        <p className="text-sm text-slate-600 mt-1">
          記録は散り、証拠は消え、価値は流通しない。日本の自動車後付け施工市場の現実。
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            big: "1件 30分",
            tag: "記録が消える",
            title: "「あの施工、いつだったっけ?」",
            body: "施工写真は LINE、見積は Excel、車検証はファイル棚。1 件あたり 30 分以上の二重入力が日常。3 年前の履歴は実質追えない。",
          },
          {
            big: "改ざん耐性 0",
            tag: "証拠にならない",
            title: "「やった」を、誰も証明できない。",
            body: "保証期間中のトラブル・保険会社からの確認・中古車買取での過去施工歴。第三者検証の手段が現場に存在しない。",
          },
          {
            big: "+ ¥0",
            tag: "価値が承継されない",
            title: "高額施工が、査定で加点ゼロ。",
            body: "30 万円のコーティング・100 万円の PPF が、3 年後の中古車査定では加点 0 円。職人の技術が経済価値として承継されない。",
          },
        ].map((item) => (
          <div key={item.tag} className="rounded-xl border border-rose-200 bg-rose-50/50 p-5 flex flex-col gap-3">
            <div className="text-3xl font-extrabold text-rose-600 leading-none">{item.big}</div>
            <Chip color="rose">{item.tag}</Chip>
            <h3 className="text-base font-bold text-slate-900 leading-snug">{item.title}</h3>
            <p className="text-xs text-slate-700 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  </S>
);

// ─── 4. Solution ─────────────────────────────────────────────────
const S4 = (
  <S n={4}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>ソリューション</SectionLabel>
        <H2>4 ステークホルダーを 1 つの台帳でつなぐ</H2>
        <p className="text-sm text-slate-600 mt-1">
          施工店業務 SaaS を入口に、施工証明書を業界横断の「車の施工台帳」に育てる。
        </p>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-bold text-amber-800">Ledra プラットフォーム</span>
            <span className="text-[11px] text-amber-700">Multi-tenant SaaS + Public Verification Layer</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 flex-1">
          {[
            {
              role: "施工店",
              port: "Admin Portal",
              body: "予約 → 来店 → 作業 → 証明書発行 → 請求 → 入金 を 1 画面で完結。POS / 在庫 / 帳票 / 案件ワークフロー / スタッフ教育まで統合。",
            },
            {
              role: "顧客",
              port: "Customer Portal",
              body: "施工証明書をスマホで閲覧 / 共有。QR / NFC タグから即アクセス。車両ごとに履歴を時系列で管理。",
            },
            {
              role: "代理店",
              port: "Agent Portal",
              body: "施工店紹介・コミッション管理・キャンペーン配信。FC 的な拡大を支える 7 機能。",
            },
            {
              role: "損保 / 中古車",
              port: "Insurer Portal",
              body: "車両 VIN / ナンバーから施工履歴を即時照会。塗膜厚レポートを査定エビデンスに。",
            },
          ].map((p) => (
            <div key={p.role} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2 shadow-sm">
              <Chip color="orange">{p.role}</Chip>
              <div className="text-xs font-bold text-slate-900">{p.port}</div>
              <p className="text-[11px] text-slate-700 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </S>
);

// ─── 5. Why Now ─────────────────────────────────────────────────
const S5 = (
  <S n={5}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>Why Now</SectionLabel>
        <H2>車の履歴がデジタル化される、10 年に 1 度の窓</H2>
        <p className="text-sm text-slate-600 mt-1">4 つの外部要因が「施工台帳」需要を同時に立ち上げている。</p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1">
        {[
          {
            tag: "SDV / 法令",
            title: "整備履歴デジタル化の制度化",
            body: "OBD 検査の電子化、SDV (Software Defined Vehicle) 普及、車検制度の電子化など、車両履歴をデジタルで残す制度・規格が一斉に立ち上がっている。",
          },
          {
            tag: "損保",
            title: "不正請求対策とエビデンス重視",
            body: "中古車販売大手の不正請求問題以降、損保業界は「施工証拠の客観的検証」を強く求めている。第三者改ざん検知可能な記録は監督官庁要件にも合致。",
          },
          {
            tag: "中古車流通",
            title: "透明性・付加価値の可視化ニーズ",
            body: "UCDA・JAAA 等の透明化推進、EV / 高額カスタム車の増加で「施工履歴を価値に変える」需要が顕在化。買取大手も施工エビデンスを評価軸に取り込み始めた。",
          },
          {
            tag: "DX / SaaS 横展開",
            title: "バーティカル SaaS 投資の活発化",
            body: "整備業界 DX 補助金、IT 導入補助金が追い風。職人産業×バーティカル SaaS は国内で再評価フェーズに入り、JAFCO SEED の重点投資領域とも整合。",
          },
        ].map((item) => (
          <div key={item.tag} className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col gap-2">
            <Chip color="amber">{item.tag}</Chip>
            <h3 className="text-base font-bold text-slate-900 leading-snug mt-1">{item.title}</h3>
            <p className="text-xs text-slate-700 leading-relaxed">{item.body}</p>
          </div>
        ))}
      </div>
    </div>
  </S>
);

// ─── 6. Product ─────────────────────────────────────────────────
const S6 = (
  <S n={6}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>プロダクト</SectionLabel>
        <H2>すでに動いている、フルスタック実装</H2>
        <p className="text-sm text-slate-600 mt-1">
          検証段階ではなく、本番運用中のプロダクト。シード資金は機能開発ではなく「流通拡大」に投下。
        </p>
      </div>
      <div className="flex gap-5 flex-1">
        <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-600">実装規模</div>
          <div className="space-y-2">
            {[
              { k: "API Route Handlers", v: "400+" },
              { k: "DB Migrations", v: "130+" },
              { k: "Test Cases (Unit + E2E)", v: "2,000+" },
              { k: "管理画面・帳票・ダッシュボード", v: "60+ 画面" },
              { k: "モバイルアプリ (iOS / Android)", v: "公開済" },
              { k: "外部連携", v: "Stripe / Square / Google Calendar / LINE / CloudSign / Polygon" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2 last:border-0"
              >
                <span className="text-xs text-slate-700">{row.k}</span>
                <span className="text-xs font-bold text-amber-700 text-right">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col gap-3">
          <div className="text-xs font-semibold uppercase tracking-widest text-amber-600">
            差別化機能（既に実装済み）
          </div>
          <div className="space-y-3">
            {[
              { title: "案件ワークスペース", body: "予約から入金まで 1 画面で完結する施工店向け統合 UI。" },
              { title: "塗膜厚レポート連携", body: "PosiTector 等の計測機データを車両・施工に紐付けて保存。" },
              { title: "Ledra Academy", body: "AI Q&A + 受講証明書 PDF 発行を備えた施工技能教育。" },
              { title: "POS / 在庫 / 帳票デザイナー", body: "Apple Tap to Pay 対応、SKU 在庫、テンプレ編集まで内蔵。" },
              { title: "Polygon アンカリング", body: "写真ハッシュをチェーン記録、第三者改ざん検知を実現。" },
            ].map((row) => (
              <div key={row.title}>
                <div className="text-xs font-bold text-slate-900">{row.title}</div>
                <p className="text-[11px] text-slate-700 leading-relaxed mt-0.5">{row.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </S>
);

// ─── 7. Differentiation ─────────────────────────────────────────────────
const S7 = (
  <S n={7}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>差別化</SectionLabel>
        <H2>3 層の参入障壁</H2>
        <p className="text-sm text-slate-600 mt-1">
          単体機能ではなく「現場知見 × 技術 × ネットワーク」の三層で模倣困難性を構築。
        </p>
      </div>
      <div className="flex-1 flex flex-col gap-3 justify-center">
        {[
          {
            n: 1,
            layer: "現場知見レイヤー",
            title: "代表が施工店オーナーとして 4 年運用",
            body: "年間 700 台の施工現場で痛感した課題を直接プロダクトに反映。施工店 UX の解像度が他社と圧倒的に違う。",
          },
          {
            n: 2,
            layer: "技術レイヤー",
            title: "Polygon × C2PA × 塗膜厚計測機の統合",
            body: "ブロックチェーン改ざん検知 + コンテンツ認証 + 計測機データ連携。Web2 SaaS 単独では到達できない検証可能性。",
          },
          {
            n: 3,
            layer: "ネットワークレイヤー",
            title: "施工店 / 顧客 / 代理店 / 損保・中古車の 4 者統合",
            body: "施工台帳が業界横断で参照されるほど、施工店にとっての離脱コストが増大。後発参入で逆転困難な二重ネットワーク効果。",
          },
        ].map((step) => (
          <div key={step.n} className="flex items-start gap-4">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-sm font-bold text-white shadow-md">
              {step.n}
            </div>
            <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Chip color="orange">{step.layer}</Chip>
              </div>
              <div className="text-sm font-bold text-slate-900">{step.title}</div>
              <p className="text-[11px] text-slate-700 leading-relaxed mt-1">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </S>
);

// ─── 8. Founder-Market Fit ─────────────────────────────────────────────────
const S8 = (
  <S n={8}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>Founder-Market Fit</SectionLabel>
        <H2>「整備士 × 板金 × カスタム営業 × 施工店経営」</H2>
        <p className="text-sm text-slate-600 mt-1">
          代表自身が、本プロダクトのターゲット顧客として 10 年を過ごしてきた。
        </p>
      </div>
      <div className="flex-1 flex flex-col gap-2 justify-center">
        {[
          {
            year: "2014",
            role: "整備士見習い",
            place: "川原代自動車電機工業所(1.5 年)",
            fit: "自動車整備実務の基礎",
          },
          {
            year: "2015",
            role: "鈑金塗装",
            place: "有限会社 BPコーポレーション(半年)",
            fit: "板金 / 塗装 / 損保案件の実務",
          },
          {
            year: "2016",
            role: "新規事業 / 接客",
            place: "カフェ「Hungry」(つくば市)新規立ち上げ・大江戸温泉物語・快活クラブ",
            fit: "0→1 と店舗運営 UX の知見",
          },
          {
            year: "2018",
            role: "ハイエース営業",
            place: "フレックス株式会社 つくば店",
            fit: "高額カスタム市場・中古車流通の解像度",
          },
          {
            year: "2020",
            role: "個人事業独立",
            place: "用品取付 / コーティング / クリーニング(4 年)",
            fit: "年間 700 台施工・年商 1,000→1,300 万円",
          },
          {
            year: "2024/11",
            role: "法人化",
            place: "株式会社HOLY 設立 → Ledra 開発",
            fit: "自社の現場知見をプロダクト化",
          },
        ].map((row) => (
          <div
            key={row.year}
            className="flex items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2"
          >
            <div className="text-amber-700 font-mono text-xs font-bold w-16 shrink-0">{row.year}</div>
            <div className="text-sm font-bold text-slate-900 w-40 shrink-0">{row.role}</div>
            <div className="text-[11px] text-slate-700 flex-1 min-w-0 truncate">{row.place}</div>
            <Chip color="amber">{row.fit}</Chip>
          </div>
        ))}
      </div>
    </div>
  </S>
);

// ─── 9. Traction ─────────────────────────────────────────────────
const S9 = (
  <S n={9}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>トラクション</SectionLabel>
        <H2>自社施工店 × 4 年 × 2,800 台で実地検証済み</H2>
        <p className="text-sm text-slate-600 mt-1">
          SaaS 単体の数字は黎明期だが、創業者が自社で運営する施工店での運用検証は累計 4 年 2,800 台に及ぶ。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5 flex-1">
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-5 flex flex-col gap-3">
          <Chip color="orange">SaaS 本体(2026/05 時点)</Chip>
          <div className="space-y-2">
            {[
              { k: "有料テナント", v: "3 社" },
              { k: "無料トライアル", v: "7 社" },
              { k: "MRR", v: "¥59,400" },
              { k: "月間証明書発行", v: "10 件" },
              { k: "累計証明書", v: "21 件" },
              { k: "本番稼働期間", v: "PMF 検証フェーズ" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between border-b border-amber-200 pb-2 last:border-0"
              >
                <span className="text-xs text-slate-700">{row.k}</span>
                <span className="text-sm font-bold text-amber-700">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-emerald-300 bg-emerald-50/60 p-5 flex flex-col gap-3">
          <Chip color="green">創業者の自社運営施工店(4 年実績)</Chip>
          <div className="space-y-2">
            {[
              { k: "施工台数(年間)", v: "700 台" },
              { k: "累計施工台数", v: "2,800 台" },
              { k: "年商推移", v: "¥1,000 万 → ¥1,300 万" },
              { k: "成長率(4 年複合)", v: "+30%" },
              { k: "事業継続年数", v: "4 年" },
              { k: "施工メニュー", v: "コーティング / 用品 / クリーニング" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between border-b border-emerald-200 pb-2 last:border-0"
              >
                <span className="text-xs text-slate-700">{row.k}</span>
                <span className="text-sm font-bold text-emerald-700">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-600 leading-relaxed text-center -mt-1">
        プロダクトは「いま作るもの」ではなく「すでに自社施工店で 4 年運用された業務を SaaS 化したもの」である。
      </p>
    </div>
  </S>
);

// ─── 10. Market ─────────────────────────────────────────────────
const S10 = (
  <S n={10}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>市場規模</SectionLabel>
        <H2>3 つの巨大市場の「結節点」を取りに行く</H2>
        <p className="text-sm text-slate-600 mt-1">
          単独市場の SaaS ではなく、整備 × 保険 × 中古車の交点に施工台帳プロトコルを置く。
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: "自動車整備市場",
            value: "5.7 兆円",
            sub: "整備業 / 板金 / コーティング / PPF",
            source: "日整連『自動車特定整備業実態調査』",
          },
          {
            label: "自動車保険市場",
            value: "4.4 兆円",
            sub: "元受正味保険料(任意保険)",
            source: "日本損害保険協会ファクトブック",
          },
          {
            label: "中古車流通市場",
            value: "9.0 兆円",
            sub: "中古車登録台数 × 平均価格",
            source: "JADA / 中販連 推計",
          },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-amber-300 bg-amber-50/60 p-5 flex flex-col gap-2">
            <div className="text-xs text-slate-600">{m.label}</div>
            <div className="text-3xl font-extrabold text-amber-700">{m.value}</div>
            <div className="text-[11px] text-slate-700">{m.sub}</div>
            <div className="text-[10px] text-slate-500 border-t border-amber-200 pt-2">出典: {m.source}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex-1 flex flex-col gap-3 justify-center">
        <div className="grid grid-cols-3 gap-4 text-center">
          {[
            { k: "TAM", v: "19.1 兆円", sub: "3 市場合計" },
            {
              k: "SAM",
              v: "約 2,800 億円",
              sub: "施工後付け市場(コーティング・PPF・板金・整備の DX 対象部分)",
            },
            {
              k: "SOM (5年)",
              v: "約 2.9 億円",
              sub: "国内コーティング/PPF 専業 約 1 万社のうち 1,000 店 × ARPU 月 ¥24,000 × 12 ヶ月",
            },
          ].map((m) => (
            <div key={m.k}>
              <div className="text-xs uppercase tracking-widest text-amber-600">{m.k}</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{m.v}</div>
              <div className="text-[10px] text-slate-600 leading-tight mt-1">{m.sub}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 text-center -mt-1">
          ※ SOM は店舗サブスクのみ。中期的には保険会社課金 + 流通手数料の 3 階建てで ARR 10 億規模を狙う。
        </p>
      </div>
    </div>
  </S>
);

// ─── 11. Business Model ─────────────────────────────────────────────────
const S11 = (
  <S n={11}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>ビジネスモデル</SectionLabel>
        <H2>サブスク × アドオン × トランザクションの 3 階建て</H2>
        <p className="text-sm text-slate-600 mt-1">
          基盤の月額課金に加え、ブランド証明書・流通手数料で ARPU を段階的に伸ばす。
        </p>
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="grid grid-cols-5 text-xs font-semibold text-amber-700 bg-amber-50 px-4 py-2.5 border-b border-slate-200 uppercase tracking-wide">
            <span>プラン</span>
            <span>月額</span>
            <span>証明書</span>
            <span>ユーザー</span>
            <span>主要機能</span>
          </div>
          {[
            { plan: "フリー", price: "¥0", cert: "5 件 / 月", user: "1", feat: "お試し検証" },
            { plan: "スターター", price: "¥9,800", cert: "50 件 / 月", user: "3", feat: "基本業務 SaaS" },
            { plan: "スタンダード", price: "¥24,800", cert: "300 件 / 月", user: "10", feat: "Academy / 帳票編集" },
            { plan: "プロ", price: "¥49,800", cert: "無制限", user: "無制限", feat: "POS / 在庫 / 全機能" },
          ].map((row) => (
            <div
              key={row.plan}
              className="grid grid-cols-5 px-4 py-2.5 text-xs border-b border-slate-100 last:border-0"
            >
              <span className="text-slate-900 font-semibold">{row.plan}</span>
              <span className="text-amber-700 font-bold">{row.price}</span>
              <span className="text-slate-700">{row.cert}</span>
              <span className="text-slate-700">{row.user}</span>
              <span className="text-slate-700 text-[11px]">{row.feat}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 flex-1">
          {[
            {
              tag: "①サブスク",
              title: "店舗業務 SaaS 月額",
              body: "施工店の業務を1画面に統合する基盤レイヤー。ARPU ¥24,000 想定。",
            },
            {
              tag: "②アドオン",
              title: "ブランド証明書 / 追加店舗",
              body: "ブランド証明書 ¥3,300〜 / 追加店舗 ¥4,980 / 月。テンプレデザイナーで内製化。",
            },
            {
              tag: "③トランザクション",
              title: "損保査定 / 中古車流通手数料",
              body: "施工台帳の参照・査定エビデンス提供に対する取引手数料を中期収益として設計。",
            },
          ].map((m) => (
            <div key={m.tag} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
              <Chip color="amber">{m.tag}</Chip>
              <div className="text-sm font-bold text-slate-900">{m.title}</div>
              <p className="text-[11px] text-slate-700 leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </S>
);

// ─── 12. Competition ─────────────────────────────────────────────────
const S12 = (
  <S n={12}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>競合</SectionLabel>
        <H2>業務 SaaS × 流通レイヤーの「空白」</H2>
        <p className="text-sm text-slate-600 mt-1">現在この交差点に立つプレイヤーは国内に存在しない。</p>
      </div>
      <div className="flex-1 flex gap-5">
        <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-5 relative">
          <div className="absolute top-3 left-3 text-[10px] text-slate-500">業界横断ネットワーク</div>
          <div className="absolute bottom-3 left-3 text-[10px] text-slate-500">店舗単体運用</div>
          <div className="absolute top-1/2 left-3 text-[10px] text-slate-500 -rotate-90 origin-left">
            ↑ 流通レイヤー
          </div>
          <div className="absolute bottom-3 right-3 text-[10px] text-slate-500">改ざん検証 / 公開検証</div>
          <div className="absolute bottom-3 left-1/2 text-[10px] text-slate-500 -translate-x-1/2">→ 検証可能性</div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
            <div className="absolute top-[20%] left-[15%] text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 shadow-sm">
              整備工場 SaaS(broline 等)
            </div>
            <div className="absolute top-[55%] left-[10%] text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 shadow-sm">
              紙台帳 / Excel
            </div>
            <div className="absolute top-[70%] left-[35%] text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 shadow-sm">
              自前 PDF 証明書
            </div>
            <div className="absolute top-[25%] left-[55%] text-[11px] px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 shadow-sm">
              中古車 PF / 損保査定系
            </div>
            <div className="absolute top-[15%] left-[68%] text-[12px] px-3 py-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold shadow-lg">
              Ledra
            </div>
          </div>
        </div>
        <div className="w-72 flex flex-col gap-3">
          <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
            <div className="text-xs font-bold text-amber-800 mb-1">Ledra のポジション</div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              業務 SaaS(縦軸:店舗運用) と 証明書ネットワーク(横軸:検証・流通)の両方を統合した唯一のプレイヤー。
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-900 mb-1">後発参入の障壁</div>
            <p className="text-[11px] text-slate-700 leading-relaxed">
              二重ネットワーク効果(施工店密度 × 損保中古車側の参照量)が立ち上がると、機能模倣ではキャッチアップ不能。
            </p>
          </div>
        </div>
      </div>
    </div>
  </S>
);

// ─── 13. Roadmap ─────────────────────────────────────────────────
const S13 = (
  <S n={13}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>ロードマップ</SectionLabel>
        <H2>6 / 12 / 24 ヶ月の道筋</H2>
        <p className="text-sm text-slate-600 mt-1">
          プロダクトは完成済み。次の 24 ヶ月は「流通ネットワーク」と「業界標準化」に投下。
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 flex-1">
        {[
          {
            term: "6 ヶ月",
            kpi: "加盟店 30 社 / MRR ¥75 万",
            items: [
              "代理店ネットワーク立ち上げ(5 社)",
              "損保 PoC 1 社着手",
              "中古車事業者 LOI 5 件",
              "プロダクト UX 改善(オンボーディング短縮)",
            ],
          },
          {
            term: "12 ヶ月",
            kpi: "加盟店 100 社 / MRR ¥241 万 / ARR ¥1,716 万",
            items: [
              "損保 1 社 本番接続",
              "中古車事業者 40 社 接続",
              "月間証明書発行 1,500 件",
              "チーム 4 名体制(代表 + CTO/エンジニア + セールス)",
            ],
          },
          {
            term: "24 ヶ月",
            kpi: "業界標準プロトコル化 / 海外 PoC",
            items: [
              "Vehicle Passport ウォレット化",
              "海外 PoC 着手(東南アジア / 台湾)",
              "Fintech 領域(修理ローン・保険連動)参入",
              "シリーズ A 調達",
            ],
          },
        ].map((m, i) => (
          <div
            key={m.term}
            className={`rounded-xl border ${
              i === 1 ? "border-amber-400 bg-amber-50/80" : "border-slate-200 bg-slate-50"
            } p-5 flex flex-col gap-3`}
          >
            <div className="flex items-center justify-between">
              <Chip color={i === 1 ? "orange" : "amber"}>{m.term}</Chip>
              <span className="text-[10px] text-slate-600 font-semibold">{i === 1 ? "本ラウンド目標" : ""}</span>
            </div>
            <div className="text-sm font-bold text-slate-900 leading-snug">{m.kpi}</div>
            <ul className="space-y-1.5 mt-1">
              {m.items.map((it) => (
                <li key={it} className="text-[11px] text-slate-700 leading-relaxed flex gap-2">
                  <span className="text-amber-600">▸</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  </S>
);

// ─── 14. Team ─────────────────────────────────────────────────
const S14 = (
  <S n={14}>
    <div className="flex flex-col flex-1 px-10 pt-8 pb-2 gap-5">
      <div>
        <SectionLabel>チーム</SectionLabel>
        <H2>現場一次情報を持つ Founder + 本ラウンドで採用拡充</H2>
        <p className="text-sm text-slate-600 mt-1">
          施工店オーナーとしての 4 年間の運用知見をプロダクトに直接反映できる体制。
        </p>
      </div>
      <div className="flex-1 flex flex-col gap-4">
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-5 flex gap-5">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-2xl font-extrabold text-white shadow-md shrink-0">
            堀越
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-base font-bold text-slate-900">堀越 友輔(30)</span>
              <Chip color="orange">代表取締役 / Founder</Chip>
              <span className="text-[11px] text-slate-600">1995/06/19 生</span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed mt-2">
              整備士見習い・板金塗装の現場 →
              フレックス株式会社つくば店(ハイエース・ランドクルーザー専門店)でカスタム営業 → 2020
              年自動車関連事業で独立、4 年間で年間 700 台・年商 1,300 万円規模に成長 → 2024 年 11 月、株式会社 HOLY
              設立。自社で 4 年運用した課題を起点に Ledra
              を内製開発。整備・板金・カスタム・コーティング・接客・新規事業立ち上げを実務で経験した稀有なバックグラウンド。
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              role: "CTO / Lead Engineer",
              status: "本ラウンドで採用予定",
              desc: "Next.js / Supabase / Polygon 経験者。プロダクト共同責任者。",
            },
            {
              role: "セールス / CS",
              status: "本ラウンドで採用予定",
              desc: "整備・自動車業界のセールス経験者を想定。代理店ネットワーク拡張。",
            },
            {
              role: "アドバイザー",
              status: "オープン枠",
              desc: "損保 / 中古車流通 / バーティカル SaaS 出身者を募集中。",
            },
          ].map((r) => (
            <div key={r.role} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
              <div className="text-xs font-bold text-slate-900">{r.role}</div>
              <Chip color="amber">{r.status}</Chip>
              <p className="text-[11px] text-slate-700 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-600 text-center -mt-1">
          現状代表 1 名がプロダクト企画・開発・現場運用を兼任。本ラウンドで CTO とセールスを採用し、4 名体制で 12
          ヶ月計画を遂行。
        </p>
      </div>
    </div>
  </S>
);

// ─── 15. Ask ─────────────────────────────────────────────────
const S15 = (
  <S n={15}>
    <div className="flex flex-col flex-1 px-10 pt-6 pb-2 gap-3">
      <div>
        <SectionLabel>調達希望</SectionLabel>
        <H2>シード ¥3,000 万円 / Pre-money ¥2 億円</H2>
        <p className="text-xs text-slate-600 mt-1">
          JAFCO 様にリードをお願いし、12 ヶ月で MRR ¥241 万 / 加盟 100 社 / 損保 1 社接続 を達成する。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">資金使途</div>
          <div className="space-y-1.5">
            {[
              { k: "エンジニア採用", v: "25%", body: "CTO 候補 + フルスタック 1 名" },
              { k: "プロダクト開発", v: "20%", body: "損保 API / Vehicle Passport / Academy" },
              { k: "セールス / CS 採用", v: "20%", body: "代理店 / 直販 / オンボーディング" },
              { k: "損保・中古車提携", v: "20%", body: "BD 専任 + パイロット費用" },
              { k: "マーケティング", v: "10%", body: "業界イベント・コンテンツ・SEO" },
              { k: "運転資金", v: "5%", body: "予備費" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between gap-3 border-b border-amber-200 pb-1 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-900">{row.k}</div>
                  <div className="text-[10px] text-slate-600">{row.body}</div>
                </div>
                <span className="text-sm font-bold text-amber-700 shrink-0">{row.v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">12 ヶ月後 KPI</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 flex-1">
            {[
              { k: "加盟施工店", v: "100 社" },
              { k: "MRR", v: "¥241 万" },
              { k: "ARR", v: "¥1,716 万" },
              { k: "損保接続", v: "1 社" },
              { k: "中古車事業者", v: "40 社" },
              { k: "月間証明書", v: "1,500 件" },
              { k: "チーム", v: "4 名" },
              { k: "次ラウンド", v: "シリーズ A 準備" },
            ].map((row) => (
              <div key={row.k} className="border-b border-slate-200 pb-1">
                <div className="text-[10px] text-slate-600">{row.k}</div>
                <div className="text-sm font-bold text-amber-700">{row.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-[11px] text-slate-700">
          <span className="font-bold text-slate-900">堀越 友輔</span>
          <span className="text-slate-400">·</span>
          <span>株式会社 HOLY</span>
          <span className="text-slate-400">·</span>
          <span>東京都港区北青山 1-3-1 アールキューブ青山 3F</span>
          <span className="text-slate-400">·</span>
          <span>ledra.co.jp</span>
        </div>
        <span className="text-sm font-bold text-amber-700 shrink-0">職人の技術を、次へつなぐ。</span>
      </div>
    </div>
  </S>
);

// ─── Page ───────────────────────────────────────────────────────

export const metadata = {
  title: "Ledra | JAFCO SEED 2026 Pitch Deck",
  robots: { index: false, follow: false },
};

const slides: Slide[] = [
  { id: "cover", node: S1 },
  { id: "mission", node: S2 },
  { id: "problem", node: S3 },
  { id: "solution", node: S4 },
  { id: "why-now", node: S5 },
  { id: "product", node: S6 },
  { id: "differentiation", node: S7 },
  { id: "fmf", node: S8 },
  { id: "traction", node: S9 },
  { id: "market", node: S10 },
  { id: "business-model", node: S11 },
  { id: "competition", node: S12 },
  { id: "roadmap", node: S13 },
  { id: "team", node: S14 },
  { id: "ask", node: S15 },
];

export default function JafcoPitchPage() {
  return <PitchDeck slides={slides} label="JAFCO SEED 2026" />;
}
