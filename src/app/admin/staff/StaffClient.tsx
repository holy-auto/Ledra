"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { SUGGESTED_SKILLS } from "@/lib/staff/skills";
import { formatDate } from "@/lib/format";

type StaffStats = {
  assignments_total: number;
  completed: number;
  cancelled: number;
  avg_work_minutes: number | null;
};
type Staff = {
  id: string;
  user_id: string | null;
  name: string;
  kind: "internal" | "external";
  email: string | null;
  phone: string | null;
  skills: string[];
  color: string | null;
  is_active: boolean;
  note: string | null;
  /** レス率（0〜1）。外注請求書の金額自動計算に使うデフォルト値。 */
  commission_rate: number | null;
  stats: StaffStats;
};
type Member = { user_id: string; display_name: string | null; email: string | null };
type Shift = {
  id?: string;
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};

type Draft = {
  id?: string;
  name: string;
  kind: "internal" | "external";
  user_id: string | null;
  email: string;
  phone: string;
  skillsText: string;
  is_active: boolean;
  /** レス率の入力欄用テキスト（%表記、例: "70"）。空文字は未設定。 */
  commissionRateText: string;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  kind: "internal",
  user_id: null,
  email: "",
  phone: "",
  skillsText: "",
  is_active: true,
  commissionRateText: "",
};

function parseSkills(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,、]/)) {
    const t = raw.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffClient() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  // シフト編集
  const [shiftStaffId, setShiftStaffId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftLoading, setShiftLoading] = useState(false);
  // 読み込み失敗フラグ。失敗を「空シフト」と誤認して保存→既存シフト全消去を防ぐ。
  const [shiftLoadError, setShiftLoadError] = useState(false);
  // 直近に開いたスタッフID。古い fetch 応答を破棄して別スタッフのシフト誤適用を防ぐ。
  const shiftReqRef = useRef<string | null>(null);

  const fetchStaff = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j) setStaff(j.staff ?? []);
    } catch {
      // keep
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/members", { cache: "no-store" });
      const j = await parseJsonSafe(res);
      if (res.ok && j) setMembers(j.members ?? []);
    } catch {
      // optional
    }
  }, []);

  useEffect(() => {
    fetchStaff();
    fetchMembers();
  }, [fetchStaff, fetchMembers]);

  const startAdd = () => {
    setMsg(null);
    setDraft({ ...EMPTY_DRAFT });
  };
  const startEdit = (s: Staff) => {
    setMsg(null);
    setDraft({
      id: s.id,
      name: s.name,
      kind: s.kind,
      user_id: s.user_id,
      email: s.email ?? "",
      phone: s.phone ?? "",
      skillsText: s.skills.join(", "),
      is_active: s.is_active,
      commissionRateText: s.commission_rate != null ? String(Math.round(s.commission_rate * 10000) / 100) : "",
    });
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setMsg({ text: "名前は必須です", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    const rateInput = draft.commissionRateText.trim();
    const rate = rateInput === "" ? null : Number(rateInput);
    if (rate != null && (isNaN(rate) || rate < 0 || rate > 100)) {
      setMsg({ text: "レス率は0〜100の数値で入力してください", ok: false });
      setSaving(false);
      return;
    }
    const payload = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim(),
      kind: draft.kind,
      user_id: draft.kind === "internal" ? draft.user_id : null,
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
      skills: parseSkills(draft.skillsText),
      is_active: draft.is_active,
      commission_rate: rate == null ? null : rate / 100,
    };
    try {
      const res = await fetch("/api/admin/staff", {
        method: draft.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setDraft(null);
      setMsg({ text: "保存しました", ok: true });
      await fetchStaff();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  /**
   * 外注職人へ渡す連携コード。外注は自分の Ledra でこれを入力すると、
   * **自分が施工した記録だけ**を自分の管理画面から見られるようになる。
   * raw code は発行レスポンスにしか出ない（DB はハッシュのみ）ので、ここで一度だけ表示する。
   */
  const [linkCode, setLinkCode] = useState<{ staffId: string; code: string; expiresAt: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);

  const issueLinkCode = async (st: Staff) => {
    setMsg(null);
    setLinkBusy(st.id);
    try {
      const res = await fetch("/api/admin/staff/link-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staff_member_id: st.id }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setLinkCode({ staffId: st.id, code: j.code, expiresAt: j.expires_at });
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setLinkBusy(null);
    }
  };

  const unlinkTenant = async (st: Staff) => {
    if (!confirm(`「${st.name}」との連携を解除しますか？（相手は自分の施工実績を見られなくなります）`)) return;
    setMsg(null);
    setLinkBusy(st.id);
    try {
      const res = await fetch("/api/admin/staff/link-invite", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ staff_member_id: st.id }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      if (linkCode?.staffId === st.id) setLinkCode(null);
      setMsg({ text: "連携を解除しました。", ok: true });
      await fetchStaff();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setLinkBusy(null);
    }
  };

  const removeStaff = async (s: Staff) => {
    if (!confirm(`「${s.name}」を削除しますか？（割り当て済みの案件からは外れます）`)) return;
    setMsg(null);
    try {
      const res = await fetch("/api/admin/staff", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      await fetchStaff();
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    }
  };

  const loadShifts = useCallback(async (staffId: string) => {
    setShifts([]);
    setShiftLoadError(false);
    setShiftLoading(true);
    shiftReqRef.current = staffId;
    try {
      const res = await fetch(`/api/admin/staff/shifts?staff_id=${staffId}&from=${todayStr()}`, { cache: "no-store" });
      const j = await parseJsonSafe(res);
      // 応答が届く間に別スタッフを開いていたら破棄（古い結果を適用しない）。
      if (shiftReqRef.current !== staffId) return;
      if (res.ok && j) {
        setShifts(j.shifts ?? []);
      } else {
        // 読み込み失敗。空配列のまま保存させると既存シフトを全消去してしまうため明示エラーに。
        setShiftLoadError(true);
      }
    } catch {
      if (shiftReqRef.current === staffId) setShiftLoadError(true);
    } finally {
      if (shiftReqRef.current === staffId) setShiftLoading(false);
    }
  }, []);

  const openShifts = (s: Staff) => {
    if (shiftStaffId === s.id) {
      setShiftStaffId(null);
      return;
    }
    setShiftStaffId(s.id);
    void loadShifts(s.id);
  };

  const saveShifts = async () => {
    // 読み込み未完 / 失敗時は保存しない（空配列での全消去を防ぐ）。
    if (!shiftStaffId || shiftLoading || shiftLoadError) return;
    setShiftSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/staff/shifts", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          staff_id: shiftStaffId,
          shifts: shifts
            .filter((s) => s.work_date)
            .map((s) => ({
              work_date: s.work_date,
              start_time: s.start_time || null,
              end_time: s.end_time || null,
              note: s.note || null,
            })),
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: "シフトを保存しました", ok: true });
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setShiftSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-muted">読み込み中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">{staff.length} 名のスタッフ</div>
        {!draft && (
          <button type="button" onClick={startAdd} className="btn-primary text-sm px-4 py-2">
            + スタッフを追加
          </button>
        )}
      </div>

      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-red-500"}`}>{msg.text}</div>}

      {/* 追加・編集フォーム */}
      {draft && (
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-primary">{draft.id ? "スタッフを編集" : "スタッフを追加"}</h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-secondary">名前 *</label>
              <input
                className="input-field"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="山田 太郎"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary">区分</label>
              <div className="flex gap-2">
                {(["internal", "external"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDraft({ ...draft, kind: k, user_id: k === "external" ? null : draft.user_id })}
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      draft.kind === k
                        ? "border-accent bg-accent-dim text-accent"
                        : "border-border-default bg-surface text-secondary"
                    }`}
                  >
                    {k === "internal" ? "社内" : "外注"}
                  </button>
                ))}
              </div>
            </div>

            {draft.kind === "internal" && (
              <div className="space-y-1">
                <label className="text-xs text-secondary">連携アカウント（任意）</label>
                <select
                  className="input-field"
                  value={draft.user_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, user_id: e.target.value || null })}
                >
                  <option value="">— 紐付けなし —</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted">アカウントを紐付けると証明書実績とも連動できます。</p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-secondary">メール（任意）</label>
              <input
                className="input-field"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-secondary">電話（任意）</label>
              <input
                className="input-field"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            {draft.kind === "external" && (
              <div className="space-y-1">
                <label className="text-xs text-secondary">レス率（%・任意）</label>
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  placeholder="例: 70"
                  value={draft.commissionRateText}
                  onChange={(e) => setDraft({ ...draft, commissionRateText: e.target.value })}
                />
                <p className="text-[11px] text-muted">
                  外注請求書の作成時、案件金額に自動で掛け算して支払額を算出します。
                </p>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs text-secondary">スキルタグ</label>
            <input
              className="input-field"
              value={draft.skillsText}
              onChange={(e) => setDraft({ ...draft, skillsText: e.target.value })}
              placeholder="PPF, ガラスコーティング, 磨き"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {SUGGESTED_SKILLS.map((sk) => (
                <button
                  key={sk}
                  type="button"
                  onClick={() => {
                    const cur = parseSkills(draft.skillsText);
                    if (!cur.includes(sk)) setDraft({ ...draft, skillsText: [...cur, sk].join(", ") });
                  }}
                  className="rounded-full border border-border-default bg-surface px-2 py-0.5 text-[11px] text-secondary hover:bg-surface-hover"
                >
                  + {sk}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            />
            稼働中
          </label>

          <div className="flex gap-2">
            <button type="button" onClick={saveDraft} disabled={saving} className="btn-primary text-sm px-4 py-2">
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="btn-secondary text-sm px-4 py-2"
              disabled={saving}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* スタッフ一覧 */}
      {staff.length === 0 && !draft ? (
        <div className="glass-card p-8 text-center text-sm text-muted">
          スタッフがまだ登録されていません。「+ スタッフを追加」から社内スタッフ・外注職人を登録できます。
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map((s) => (
            <div key={s.id} className={`glass-card p-4 ${s.is_active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-primary">{s.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        s.kind === "external" ? "bg-warning-dim text-warning" : "bg-accent-dim text-accent"
                      }`}
                    >
                      {s.kind === "external" ? "外注" : "社内"}
                    </span>
                    {!s.is_active && <span className="text-[10px] text-muted">休止中</span>}
                  </div>
                  {s.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.skills.map((sk) => (
                        <span
                          key={sk}
                          className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[11px] text-secondary"
                        >
                          {sk}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs">
                  <div className="text-center">
                    <div className="text-base font-bold text-primary">{s.stats.assignments_total}</div>
                    <div className="text-[10px] text-muted">担当</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold text-success">{s.stats.completed}</div>
                    <div className="text-[10px] text-muted">完了</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold text-primary">
                      {s.stats.avg_work_minutes != null ? `${Math.round(s.stats.avg_work_minutes)}分` : "—"}
                    </div>
                    <div className="text-[10px] text-muted">平均作業</div>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => startEdit(s)} className="btn-secondary text-xs px-3 py-1.5">
                  編集
                </button>
                <button type="button" onClick={() => openShifts(s)} className="btn-secondary text-xs px-3 py-1.5">
                  シフト {shiftStaffId === s.id ? "▲" : "▼"}
                </button>
                {s.kind === "external" && (
                  <Link
                    href={`/admin/documents?type=staff_invoice&create=1&staff_id=${s.id}`}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    外注請求書を作成
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => issueLinkCode(s)}
                  disabled={!s.is_active || linkBusy === s.id}
                  title={
                    s.is_active
                      ? "外注が自分の Ledra で入力する連携コードを発行します"
                      : "休止中の職人には発行できません"
                  }
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {linkBusy === s.id ? "処理中…" : "連携コードを発行"}
                </button>
                <button
                  type="button"
                  onClick={() => unlinkTenant(s)}
                  disabled={linkBusy === s.id}
                  className="text-xs px-3 py-1.5 text-secondary hover:underline disabled:opacity-50"
                >
                  連携を解除
                </button>
                <button
                  type="button"
                  onClick={() => removeStaff(s)}
                  className="text-xs px-3 py-1.5 text-red-500 hover:underline"
                >
                  削除
                </button>
              </div>

              {/* 発行直後の一度きりの表示。raw code は DB に無いので、閉じたら再発行が要る。 */}
              {linkCode?.staffId === s.id && (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs dark:border-amber-800/50 dark:bg-amber-950">
                  <div className="font-semibold text-amber-800 dark:text-amber-400">
                    このコードを本人に伝えてください（今だけ表示されます）
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="rounded bg-surface px-3 py-1.5 font-mono text-sm tracking-widest text-primary">
                      {linkCode.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(linkCode.code)}
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      コピー
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkCode(null)}
                      className="text-xs px-2 py-1 text-secondary hover:underline"
                    >
                      閉じる
                    </button>
                  </div>
                  <div className="mt-2 leading-5 text-amber-800 dark:text-amber-400">
                    本人が自分の Ledra の「受注先での施工実績」で入力すると連携されます。 有効期限{" "}
                    {formatDate(linkCode.expiresAt)}。再表示はできません（保存しているのはハッシュのみ）。
                    連携後に相手が見られるのは<span className="font-semibold">その人が施工した記録だけ</span>で、
                    お客様の氏名・連絡先は含まれません。
                  </div>
                </div>
              )}

              {/* シフト編集 */}
              {shiftStaffId === s.id && (
                <div className="mt-3 rounded-lg border border-border-subtle bg-surface p-3 space-y-2">
                  <div className="text-xs font-semibold text-primary">稼働シフト（本日以降）</div>
                  {shiftLoading ? (
                    <div className="text-[11px] text-muted">読み込み中…</div>
                  ) : shiftLoadError ? (
                    <div className="space-y-2">
                      <div className="text-[11px] text-red-500">
                        シフトの読み込みに失敗しました。このまま保存すると既存のシフトが消える恐れがあるため、再読み込みしてください。
                      </div>
                      <button
                        type="button"
                        onClick={() => loadShifts(s.id)}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        再読み込み
                      </button>
                    </div>
                  ) : (
                    <>
                      {shifts.length === 0 && <div className="text-[11px] text-muted">シフトはまだありません。</div>}
                      {shifts.map((sh, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            className="input-field w-40"
                            value={sh.work_date}
                            onChange={(e) =>
                              setShifts(shifts.map((x, j) => (j === i ? { ...x, work_date: e.target.value } : x)))
                            }
                          />
                          <input
                            type="time"
                            className="input-field w-28"
                            value={sh.start_time ?? ""}
                            onChange={(e) =>
                              setShifts(shifts.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))
                            }
                          />
                          <span className="text-muted text-xs">〜</span>
                          <input
                            type="time"
                            className="input-field w-28"
                            value={sh.end_time ?? ""}
                            onChange={(e) =>
                              setShifts(shifts.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setShifts(shifts.filter((_, j) => j !== i))}
                            className="text-xs text-red-500 hover:underline"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setShifts([
                              ...shifts,
                              { work_date: todayStr(), start_time: null, end_time: null, note: null },
                            ])
                          }
                          className="btn-secondary text-xs px-3 py-1.5"
                        >
                          + 行を追加
                        </button>
                        <button
                          type="button"
                          onClick={saveShifts}
                          disabled={shiftSaving}
                          className="btn-primary text-xs px-3 py-1.5"
                        >
                          {shiftSaving ? "保存中…" : "シフトを保存"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
