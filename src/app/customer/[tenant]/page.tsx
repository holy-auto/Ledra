"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/format";
import CustomerProgressBar from "@/components/workflow/CustomerProgressBar";
import LineLinkPanel from "./LineLinkPanel";

type Row = {
  public_id: string;
  customer_name: string;
  vehicle_info_json: any;
  created_at: string;
  status: string;
};

type HistoryItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  performed_at: string;
};

type Reservation = {
  id: string;
  date: string;
  time_slot: string | null;
  menu: string | null;
  status: string;
  note: string | null;
};

type Profile = {
  name: string;
  email: string | null;
  phone: string | null;
  certificateCount: number;
  /** 連絡先の自己登録が可能なセッションか (customer_id 付きのみ)。 */
  canEditContact?: boolean;
} | null;

type VehicleInfo = Record<string, any> | null;

type ShopMembership = {
  tenant_slug: string;
  shop_name: string;
  display_name: string;
  certificate_count: number;
  reservation_count: number;
  next_reservation_at: string | null;
  line_linked: boolean;
};

function normalizeVehicleInfo(v: any): VehicleInfo {
  if (v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    try {
      const j = JSON.parse(s);
      if (j && typeof j === "object" && !Array.isArray(j)) return j as Record<string, any>;
      return { value: j };
    } catch {
      return { value: s };
    }
  }
  if (typeof v === "object") {
    if (Array.isArray(v)) return { list: v };
    return v as Record<string, any>;
  }
  return { value: v };
}

function pick(obj: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return null;
}

function toText(val: any): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  try {
    return JSON.stringify(val);
  } catch {
    return String(val);
  }
}

function buildVehicleSummary(info: VehicleInfo) {
  if (!info) return { title: "車両情報なし", lines: [] as string[], raw: null as VehicleInfo };

  const make = pick(info, ["maker", "make", "manufacturer", "brand", "メーカー", "メーカ", "車メーカー"]);
  const model = pick(info, ["model", "car_model", "vehicle_model", "name", "車種", "車名", "モデル"]);
  const grade = pick(info, ["grade", "trim", "グレード"]);
  const plate = pick(info, ["plate", "license_plate", "number_plate", "plate_no", "reg_no", "ナンバー", "登録番号"]);
  const color = pick(info, ["color", "カラー", "色"]);
  const year = pick(info, ["year", "model_year", "年式"]);
  const vin = pick(info, ["vin", "frame_no", "chassis_no", "車台番号"]);
  const mileage = pick(info, ["mileage", "odo", "走行距離"]);

  const parts: string[] = [];
  const head = [toText(make).trim(), toText(model).trim(), toText(grade).trim()].filter(Boolean).join(" / ");
  if (head) parts.push(head);
  if (plate) parts.push(`ナンバー: ${toText(plate)}`);
  if (year) parts.push(`年式: ${toText(year)}`);
  if (color) parts.push(`色: ${toText(color)}`);
  if (mileage) parts.push(`走行距離: ${toText(mileage)}`);
  if (vin) parts.push(`車台番号: ${toText(vin)}`);

  return { title: head || "車両情報", lines: parts.filter(Boolean), raw: info };
}

export default function CustomerListPage() {
  const router = useRouter();
  const params = useParams<{ tenant: string }>();
  const tenant = useMemo(() => (params?.tenant ?? "").toString(), [params]);

  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [profile, setProfile] = useState<Profile>(null);
  const [shops, setShops] = useState<ShopMembership[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"certs" | "history" | "reservations" | "inquiry" | "announcements">("certs");

  // Shop announcements (multilingual)
  const [announcements, setAnnouncements] = useState<
    { id: string; title: string; body: string; published_at: string | null; available_langs: string[] }[]
  >([]);
  const [annLang, setAnnLang] = useState<"ja" | "en" | "zh" | "vi">("ja");

  // 連絡先の自己登録 (LINE 連携だけの顧客は email / 電話が空のことがある)
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regSaving, setRegSaving] = useState(false);
  const [regMsg, setRegMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Inquiry state
  const [inquiries, setInquiries] = useState<
    { id: string; subject: string; message: string; status: string; created_at: string; admin_reply: string | null }[]
  >([]);
  const [inquirySubject, setInquirySubject] = useState("");
  const [inquiryMessage, setInquiryMessage] = useState("");
  const [inquirySending, setInquirySending] = useState(false);
  const [inquiryMsg, setInquiryMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    if (!tenant) return;

    setLoading(true);
    setErr(null);

    const res = await fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}`, {
      cache: "no-store",
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}) as Record<string, unknown>);

    if (!res.ok) {
      const e = j?.message ?? j?.error ?? "unauthorized";
      setErr(e);
      setRows([]);
      setLoading(false);
      if (res.status === 401) {
        router.replace(`/my?tenant=${encodeURIComponent(tenant)}`);
      }
      return;
    }

    const nextRows: Row[] = (j.rows ?? []) as Row[];
    nextRows.sort((a, b) => {
      const av = String(a.status ?? "").toLowerCase() === "void";
      const bv = String(b.status ?? "").toLowerCase() === "void";
      if (av !== bv) return av ? 1 : -1;
      const at = Date.parse(String(a.created_at ?? ""));
      const bt = Date.parse(String(b.created_at ?? ""));
      if (!Number.isNaN(at) && !Number.isNaN(bt) && at !== bt) return bt - at;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });
    setRows(nextRows);
    setLoading(false);

    fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}&action=profile`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.profile) setProfile(json.profile);
      })
      .catch((): void => undefined);

    fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}&action=history`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.history) setHistory(json.history);
      })
      .catch((): void => undefined);

    fetch(`/api/customer/list?tenant=${encodeURIComponent(tenant)}&action=reservations`, {
      cache: "no-store",
      credentials: "include",
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.reservations) setReservations(json.reservations);
      })
      .catch((): void => undefined);
  }

  async function loadShops() {
    const res = await fetch(`/api/portal/memberships?tenant=${encodeURIComponent(tenant)}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return;
    const j = await res.json().catch(() => ({}) as Record<string, unknown>);
    setShops(j.shops ?? []);
  }

  async function loadInquiries() {
    const res = await fetch(`/api/customer/inquiry?tenant=${encodeURIComponent(tenant)}`, {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return;
    const j = await res.json().catch(() => ({}) as Record<string, unknown>);
    setInquiries(j.inquiries ?? []);
  }

  async function loadAnnouncements(lang: "ja" | "en" | "zh" | "vi" = annLang) {
    const res = await fetch(
      `/api/announcements/shop?tenant=${encodeURIComponent(tenant)}&lang=${encodeURIComponent(lang)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const j = await res.json().catch(() => ({}) as Record<string, unknown>);
    setAnnouncements(j.announcements ?? []);
  }

  async function submitInquiry() {
    if (!inquiryMessage.trim()) return;
    setInquirySending(true);
    setInquiryMsg(null);
    try {
      const res = await fetch("/api/customer/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenant_slug: tenant,
          subject: inquirySubject.trim() || "お問い合わせ",
          message: inquiryMessage.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "送信に失敗しました");
      setInquiryMsg({ ok: true, text: "お問い合わせを送信しました。" });
      setInquirySubject("");
      setInquiryMessage("");
      loadInquiries().catch((): void => undefined);
    } catch (e: any) {
      setInquiryMsg({ ok: false, text: e?.message ?? "エラーが発生しました" });
    } finally {
      setInquirySending(false);
    }
  }

  async function saveContact() {
    setRegSaving(true);
    setRegMsg(null);
    try {
      const res = await fetch("/api/customer/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tenant_slug: tenant,
          ...(regEmail.trim() ? { email: regEmail.trim() } : {}),
          ...(regPhone.trim() ? { phone: regPhone.trim() } : {}),
        }),
      });
      const j = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? "登録に失敗しました");

      setRegMsg({ ok: true, text: "ご登録ありがとうございます。" });
      setRegEmail("");
      setRegPhone("");
      setProfile((p) =>
        p ? { ...p, email: (j.email as string | null) ?? p.email, phone: (j.phone as string | null) ?? p.phone } : p,
      );
    } catch (e: any) {
      setRegMsg({ ok: false, text: e?.message ?? "エラーが発生しました" });
    } finally {
      setRegSaving(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/portal/logout", { method: "POST", credentials: "include" });
    } finally {
      router.replace(`/my?tenant=${encodeURIComponent(tenant)}`);
    }
  }

  useEffect(() => {
    if (!tenant) return;
    load();
    loadShops().catch((): void => undefined);
    loadInquiries().catch((): void => undefined);
    loadAnnouncements().catch((): void => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant]);

  return (
    <main className="mx-auto max-w-[960px] p-6 font-sans">
      <header className="mb-4 rounded-3xl border border-border-default bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-accent">Ledra マイページ</div>
            <h1 className="mt-2 text-2xl font-bold text-primary">
              {profile ? `${profile.name} 様` : "お客様マイページ"}
            </h1>
            <div className="mt-2 text-sm text-muted">
              現在の加盟店:{" "}
              <span className="font-semibold text-primary">
                {shops.find((s) => s.tenant_slug === tenant)?.shop_name ?? tenant}
              </span>
              {profile ? <span className="ml-3">証明書: {profile.certificateCount}件</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const params = new URLSearchParams();
                if (profile?.name) params.set("name", profile.name);
                if (profile?.email) params.set("email", profile.email);
                if (profile?.phone) params.set("phone", profile.phone);
                const qs = params.toString();
                router.push(`/customer/${encodeURIComponent(tenant)}/booking${qs ? `?${qs}` : ""}`);
              }}
              className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent/90"
            >
              予約する
            </button>
            <button
              onClick={load}
              disabled={!tenant || loading}
              className="rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-hover disabled:opacity-60"
            >
              {loading ? "更新中…" : "更新"}
            </button>
            <button
              onClick={() => router.push("/my/shops")}
              className="rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-hover"
            >
              加盟店を切り替える
            </button>
            <a
              href={`/api/customer/data-export?tenant=${encodeURIComponent(tenant)}`}
              className="rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-hover"
              title="個人情報保護法 / GDPR 第15条に基づき、お客様に紐付くデータを JSON でダウンロードします。"
            >
              データをダウンロード
            </a>
            <button
              onClick={logout}
              className="rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm font-semibold text-primary hover:bg-surface-hover"
            >
              ログアウト
            </button>
          </div>
        </div>

        {shops.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {shops.map((shop) => (
              <button
                key={shop.tenant_slug}
                onClick={() => router.push(`/customer/${encodeURIComponent(shop.tenant_slug)}?from=portal`)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  shop.tenant_slug === tenant
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950 dark:text-blue-400"
                    : "border-border-default bg-surface text-secondary hover:bg-surface-hover"
                }`}
              >
                {shop.shop_name}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <LineLinkPanel key={tenant} tenantSlug={tenant} />

      {/* 連絡先が欠けているお客様への登録のお願い。LINE 連携だけで作られた顧客は
          email が無く、メール通知が届かず PC からもログインできないため。 */}
      {profile && profile.canEditContact && (!profile.email || !profile.phone) ? (
        <div className="mb-4 rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm dark:border-amber-800/50 dark:bg-amber-950">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-300">お客様情報のご登録のお願い</div>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-400">
            {!profile.email
              ? "メールアドレスをご登録いただくと、パソコンなど LINE 以外からもログインでき、大切なお知らせをメールでもお届けできます。"
              : "電話番号をご登録いただくと、ご連絡がよりスムーズになります。"}
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {!profile.email ? (
              <input
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="メールアドレス"
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30"
              />
            ) : null}
            {!profile.phone ? (
              <input
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="電話番号"
                className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30"
              />
            ) : null}
          </div>

          {regMsg ? (
            <div
              className={`mt-2 rounded-xl px-3 py-2 text-sm ${regMsg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
            >
              {regMsg.text}
            </div>
          ) : null}

          <button
            onClick={saveContact}
            disabled={regSaving || (!regEmail.trim() && !regPhone.trim())}
            className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {regSaving ? "登録中…" : "登録する"}
          </button>
        </div>
      ) : null}

      {profile && (profile.email || profile.phone) ? (
        <div className="mb-4 rounded-3xl border border-border-default bg-inset p-4 text-sm shadow-sm">
          <div className="mb-2 font-semibold text-primary">プロフィール</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-secondary">
            {profile.email ? <div>メール: {profile.email}</div> : null}
            {profile.phone ? <div>電話: {profile.phone}</div> : null}
          </div>
        </div>
      ) : null}

      <div className="mb-3 flex gap-1 border-b border-border-default">
        {[
          { key: "certs" as const, label: "証明書", count: rows.length },
          { key: "history" as const, label: "施工履歴", count: history.length },
          { key: "reservations" as const, label: "予約", count: reservations.length },
          { key: "inquiry" as const, label: "お問い合わせ", count: inquiries.length },
          { key: "announcements" as const, label: "お知らせ", count: announcements.length },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? "border-accent text-accent" : "border-transparent text-muted hover:text-secondary"
            }`}
          >
            {t.label}
            {t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400">
          ログイン状態を確認できませんでした。
          <a href={`/my?tenant=${encodeURIComponent(tenant)}`} className="ml-2 underline">
            マイページへ
          </a>
        </div>
      ) : null}

      {tab === "announcements" ? (
        <div className="mt-3 space-y-3">
          {/* 言語切替: 翻訳がある言語のみ価値があるが、常時 4 言語を出して切替可能にする */}
          <div className="flex gap-1">
            {(["ja", "en", "zh", "vi"] as const).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setAnnLang(l);
                  loadAnnouncements(l).catch((): void => undefined);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  annLang === l
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border-default text-muted hover:text-secondary"
                }`}
              >
                {l === "ja" ? "日本語" : l === "en" ? "English" : l === "zh" ? "中文" : "Tiếng Việt"}
              </button>
            ))}
          </div>

          {announcements.length === 0 ? (
            <div className="text-sm text-muted">お知らせはありません。</div>
          ) : (
            announcements.map((a) => (
              <div key={a.id} className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-primary">{a.title}</div>
                  {a.published_at ? <div className="text-xs text-muted">{formatDateTime(a.published_at)}</div> : null}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-secondary">{a.body}</div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="mt-3 grid gap-2.5">
          {history.length === 0 ? (
            <div className="text-sm text-muted">施工履歴がありません。</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-sm font-semibold text-primary">{h.title ?? h.type}</div>
                  <div className="text-xs text-muted">{formatDateTime(h.performed_at)}</div>
                </div>
                {h.description ? <div className="mt-1 text-xs text-secondary">{h.description}</div> : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "reservations" ? (
        <div className="mt-3 grid gap-2.5">
          {reservations.length === 0 ? (
            <div className="text-sm text-muted">今後の予約はありません。</div>
          ) : (
            reservations.map((r) => {
              const statusJa =
                r.status === "confirmed"
                  ? "予約確定"
                  : r.status === "arrived"
                    ? "来店受付"
                    : r.status === "in_progress"
                      ? "施工中"
                      : r.status === "completed"
                        ? "施工完了"
                        : r.status === "cancelled"
                          ? "キャンセル"
                          : r.status;

              const isActive = r.status === "arrived" || r.status === "in_progress";

              return (
                <div key={r.id} className="space-y-2">
                  <div className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-semibold text-primary">
                        {r.date}
                        {r.time_slot ? ` ${r.time_slot}` : ""}
                      </div>
                      <div
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          r.status === "confirmed"
                            ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950 dark:text-blue-400"
                            : r.status === "arrived"
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/50 dark:bg-indigo-950 dark:text-indigo-400"
                              : r.status === "in_progress"
                                ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950 dark:text-amber-400"
                                : r.status === "completed"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950 dark:text-emerald-400"
                                  : "border-border-default bg-inset text-secondary"
                        }`}
                      >
                        {statusJa}
                      </div>
                    </div>
                    {r.menu ? <div className="mt-1 text-sm text-secondary">{r.menu}</div> : null}
                    {r.note ? <div className="mt-1 text-xs text-muted">{r.note}</div> : null}
                  </div>

                  {/* 施工中の予約には進捗バーを表示 */}
                  {isActive && <CustomerProgressBar tenantSlug={tenant} reservationId={r.id} pollIntervalMs={30000} />}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2.5" style={{ display: tab === "certs" ? undefined : "none" }}>
        {rows.map((r) => {
          const rt = encodeURIComponent(`/customer/${tenant}`);
          const href = `/c/${r.public_id}?tenant=${encodeURIComponent(tenant)}&rt=${rt}&logout=1&portal=1`;
          const vi = normalizeVehicleInfo(r.vehicle_info_json);
          const vs = buildVehicleSummary(vi);
          const isVoid = (r.status ?? "").toLowerCase() === "void";
          const statusLabel = isVoid ? "VOID（無効）" : r.status ? String(r.status) : "active";

          return (
            <a key={r.public_id} href={href} className="no-underline text-inherit">
              <div
                className={`grid gap-2 rounded-2xl border bg-surface p-4 shadow-sm ${isVoid ? "border-red-200 opacity-80 dark:border-red-800/50" : "border-border-default"}`}
              >
                <div className="flex items-baseline justify-between gap-2.5">
                  <div className="text-xs text-muted">{formatDateTime(r.created_at)}</div>
                  <div
                    className={`rounded-full border px-2 py-0.5 text-xs ${isVoid ? "border-red-200 bg-red-50 text-red-700 dark:border-red-800/50 dark:bg-red-950 dark:text-red-400" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950 dark:text-emerald-400"}`}
                  >
                    {statusLabel}
                  </div>
                </div>
                <div className="text-base font-semibold text-primary">{r.customer_name}</div>
                <div className="text-[13px] text-secondary">
                  <div className="mb-0.5 font-semibold">{vs.title}</div>
                  {vs.lines.length ? (
                    <ul className="m-0 pl-4">
                      {vs.lines.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-muted">詳細情報がありません。</div>
                  )}
                </div>
                {vi ? (
                  <details className="text-xs text-secondary">
                    <summary className="cursor-pointer">車両情報（raw）</summary>
                    <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(vi, null, 2)}</pre>
                  </details>
                ) : null}
                <div className="flex justify-between gap-2.5">
                  <div className="text-xs text-muted">Public ID: {r.public_id}</div>
                  <div className="text-xs text-secondary">証明書を開く →</div>
                </div>
              </div>
            </a>
          );
        })}

        {rows.length === 0 && !err && !loading ? (
          <div className="rounded-2xl border border-border-default bg-surface p-5 text-sm text-secondary shadow-sm">
            <div className="font-semibold text-primary">この加盟店では表示できる情報が見つかりませんでした。</div>
            <div className="mt-2">他の加盟店で発行された証明書や予約がある可能性があります。</div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/my/shops" className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white">
                ご利用中の加盟店一覧を見る
              </Link>
              {shops.length > 1 ? (
                <button
                  onClick={() => router.push("/my/shops")}
                  className="rounded-2xl border border-border-default bg-surface px-4 py-3 text-sm font-semibold text-primary"
                >
                  加盟店を切り替える
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── お問い合わせタブ ── */}
      {tab === "inquiry" ? (
        <div className="mt-3 space-y-4">
          {/* 送信フォーム */}
          <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-primary">新規お問い合わせ</h2>
            <label className="block text-xs font-medium text-secondary mb-1">件名</label>
            <input
              value={inquirySubject}
              onChange={(e) => setInquirySubject(e.target.value)}
              placeholder="例）施工内容について"
              className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30 mb-3"
            />
            <label className="block text-xs font-medium text-secondary mb-1">
              メッセージ <span className="text-danger-text">*</span>
            </label>
            <textarea
              value={inquiryMessage}
              onChange={(e) => setInquiryMessage(e.target.value)}
              placeholder="ご質問やご要望をご記入ください"
              rows={4}
              className="w-full rounded-xl border border-border-default bg-surface px-3 py-2 text-sm text-primary outline-none focus:ring-2 focus:ring-accent/30 resize-none mb-3"
            />
            {inquiryMsg ? (
              <div
                className={`mb-3 rounded-xl px-3 py-2 text-sm ${inquiryMsg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
              >
                {inquiryMsg.text}
              </div>
            ) : null}
            <button
              onClick={submitInquiry}
              disabled={inquirySending || !inquiryMessage.trim()}
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {inquirySending ? "送信中…" : "送信する"}
            </button>
          </div>

          {/* 過去の問い合わせ一覧 */}
          {inquiries.length > 0 ? (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">過去のお問い合わせ</h3>
              {inquiries.map((inq) => (
                <div key={inq.id} className="rounded-2xl border border-border-default bg-surface p-4 shadow-sm">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="text-sm font-semibold text-primary">{inq.subject}</div>
                    <span
                      className={`text-xs rounded-full px-2 py-0.5 ${inq.status === "replied" ? "bg-success-dim text-success-text" : inq.status === "read" ? "bg-accent-dim text-accent-text" : "bg-warning-dim text-warning-text"}`}
                    >
                      {inq.status === "replied" ? "返信あり" : inq.status === "read" ? "確認済" : "受付中"}
                    </span>
                  </div>
                  <p className="text-xs text-secondary whitespace-pre-wrap">{inq.message}</p>
                  {inq.admin_reply ? (
                    <div className="mt-3 rounded-xl bg-accent-dim px-3 py-2">
                      <div className="text-xs font-semibold text-accent mb-1">店舗からの返信</div>
                      <p className="text-xs text-primary whitespace-pre-wrap">{inq.admin_reply}</p>
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-muted">{new Date(inq.created_at).toLocaleDateString("ja-JP")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted">過去のお問い合わせはありません。</div>
          )}
        </div>
      ) : null}
    </main>
  );
}
