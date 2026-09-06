"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PageHeader from "@/components/ui/PageHeader";
import SlotCalendarGrid, { type GridSlot } from "./SlotCalendarGrid";
import { generateIntervalSlots } from "@/lib/booking/slots";

// ─── 型定義 ──────────────────────────────────────────────────────
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface BookingSlot {
  id?: string;
  day_of_week: DayOfWeek;
  start_time: string; // "HH:MM"
  end_time: string;
  max_bookings: number;
  is_active: boolean;
  label?: string;
  accepted_categories?: string[] | null;
  _deleted?: boolean;
  _new?: boolean;
}

interface ClosedDay {
  id?: string;
  type: "weekly" | "specific";
  day_of_week?: DayOfWeek;
  closed_date?: string; // YYYY-MM-DD
  note?: string;
  _deleted?: boolean;
  _new?: boolean;
}

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"] as const;
// 1テナントあたりのスロット保存上限。bookingSettingsPutSchema.slots.max と揃える。
const SLOT_SAVE_LIMIT = 500;

// ─── ユーティリティ ───────────────────────────────────────────────
function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return times;
}
const TIME_OPTIONS = generateTimeOptions();

function newSlotId() {
  return `new_${Math.random().toString(36).slice(2)}`;
}
function newClosedId() {
  return `new_${Math.random().toString(36).slice(2)}`;
}

// "HH:MM" → 分。"24:00" は 1440。
function toMinutes(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}
// 分 → "HH:MM"（1440 は "24:00"）
function minutesToTime(m: number): string {
  if (m >= 1440) return "24:00";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ─── 共通インプット / セレクト スタイル ─────────────────────────
const inputCls =
  "text-sm border border-border-default rounded-md px-2 py-1 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const selectCls =
  "text-sm border border-border-default rounded-md px-2 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── メインコンポーネント ─────────────────────────────────────────
export default function BookingSettingsClient() {
  const [slots, setSlots] = useState<(BookingSlot & { _tempId: string })[]>([]);
  const [closedDays, setClosedDays] = useState<(ClosedDay & { _tempId: string })[]>([]);
  // 常に最新の slots / closedDays を保持する ref（保存時に古いクロージャを掴む事故を防ぐ）。
  const slotsRef = useRef(slots);
  const closedDaysRef = useRef(closedDays);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);
  useEffect(() => {
    closedDaysRef.current = closedDays;
  }, [closedDays]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"slots" | "closed">("slots");
  // 受付時間スロットの編集方法: カレンダー(grid) / 一覧(list)
  const [slotView, setSlotView] = useState<"grid" | "list">("grid");
  // 受入可否で使う作業の大カテゴリ候補（品目マスタから収集）
  const [menuCategories, setMenuCategories] = useState<string[]>([]);

  // 追加フォーム用 state
  const [newSlot, setNewSlot] = useState<Partial<BookingSlot>>({
    day_of_week: 1,
    start_time: "09:00",
    end_time: "10:00",
    max_bookings: 1,
    is_active: true,
    label: "",
  });
  const [newSpecificDate, setNewSpecificDate] = useState("");
  const [newSpecificNote, setNewSpecificNote] = useState("");
  const [weeklyClosedDows, setWeeklyClosedDows] = useState<Set<number>>(new Set());

  // ─── 一括登録フォーム（〇分毎／〇時間ごとに枠を分割生成） ───
  const [bulkDays, setBulkDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const [bulkStart, setBulkStart] = useState("09:00");
  const [bulkEnd, setBulkEnd] = useState("18:00");
  const [bulkInterval, setBulkInterval] = useState(60); // 分
  const [bulkMax, setBulkMax] = useState(1);
  const [bulkReplace, setBulkReplace] = useState(true);

  // ─── データ取得 ───
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/booking-settings");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setSlots((data.slots ?? []).map((s: BookingSlot) => ({ ...s, _tempId: s.id ?? newSlotId() })));
      const cds: (ClosedDay & { _tempId: string })[] = (data.closed_days ?? []).map((c: ClosedDay) => ({
        ...c,
        _tempId: c.id ?? newClosedId(),
      }));
      setClosedDays(cds);
      const wSet = new Set<number>();
      cds.forEach((c) => {
        if (c.type === "weekly" && c.day_of_week != null) wSet.add(c.day_of_week);
      });
      setWeeklyClosedDows(wSet);
    } catch (e) {
      console.error(e);
      showToast("error", "設定の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 受入カテゴリ候補（品目マスタの大カテゴリを重複排除して収集）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/menu-items");
        if (!res.ok) return;
        const data = await res.json();
        const cats = Array.from(
          new Set(
            (data.items ?? [])
              .map((m: { category_large?: string | null }) => (m.category_large ?? "").trim())
              .filter((c: string) => c.length > 0),
          ),
        ).sort() as string[];
        if (!cancelled) setMenuCategories(cats);
      } catch {
        /* 候補取得失敗は致命的でない（受入可否UIを出さないだけ） */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // 受入カテゴリの選択肢: 品目マスタの大カテゴリ ＋ 既存スロットに既に付いているカテゴリ。
  // 無効化/削除済み品目由来のカテゴリでも、保存済みスロットに残っていれば表示・解除できるようにする。
  const categoryOptions = useMemo(() => {
    const set = new Set(menuCategories);
    slots.forEach((s) => {
      if (!s._deleted) (s.accepted_categories ?? []).forEach((c) => c && set.add(c));
    });
    return [...set].sort();
  }, [menuCategories, slots]);

  // ─── スロット操作 ───
  function handleSlotChange(tempId: string, key: keyof BookingSlot, value: unknown) {
    setSlots((prev) => prev.map((s) => (s._tempId === tempId ? { ...s, [key]: value } : s)));
  }

  function handleDeleteSlot(tempId: string) {
    setSlots((prev) => prev.map((s) => (s._tempId === tempId ? { ...s, _deleted: true } : s)));
  }

  // 受入カテゴリのトグル（空配列は null=すべて受入に正規化）
  function toggleSlotCategory(tempId: string, cat: string) {
    setSlots((prev) =>
      prev.map((s) => {
        if (s._tempId !== tempId) return s;
        const cur = s.accepted_categories ?? [];
        const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];
        return { ...s, accepted_categories: next.length > 0 ? next : null };
      }),
    );
  }

  function handleAddSlot() {
    if (!newSlot.start_time || !newSlot.end_time) return;
    if (newSlot.start_time >= newSlot.end_time) {
      showToast("error", "終了時刻は開始時刻より後にしてください");
      return;
    }
    const tempId = newSlotId();
    setSlots((prev) => [
      ...prev,
      {
        _tempId: tempId,
        _new: true,
        day_of_week: (newSlot.day_of_week ?? 1) as DayOfWeek,
        start_time: newSlot.start_time!,
        end_time: newSlot.end_time!,
        max_bookings: newSlot.max_bookings ?? 1,
        is_active: newSlot.is_active ?? true,
        label: newSlot.label ?? "",
      },
    ]);
    setNewSlot((prev) => ({ ...prev, label: "" }));
  }

  // ─── 一括登録: 選択曜日に開始〜終了を interval 分刻みで枠を生成 ───
  function handleBulkGenerate() {
    const startMin = toMinutes(bulkStart);
    const endMin = toMinutes(bulkEnd);
    if (startMin >= endMin) {
      showToast("error", "終了時刻は開始時刻より後にしてください");
      return;
    }
    const days = [...bulkDays];
    if (days.length === 0) {
      showToast("error", "曜日を1つ以上選択してください");
      return;
    }
    const generated = generateIntervalSlots({
      days,
      startMin,
      endMin,
      intervalMin: bulkInterval,
      maxBookings: bulkMax,
    });
    if (generated.length === 0) {
      showToast("error", "枠を生成できませんでした。時間・間隔を確認してください");
      return;
    }
    const daySet = new Set(days);

    // 置き換えモード: 対象曜日の生成レンジに重なる既存枠を消す。ただし範囲外にはみ出す
    // 部分は分割して残す（09:00–18:00 に 10:00–12:00 を生成しても 09–10 / 12–18 は保持）。
    let base: (BookingSlot & { _tempId: string })[] = slots;
    if (bulkReplace) {
      const result: (BookingSlot & { _tempId: string })[] = [];
      for (const s of slots) {
        const isActiveRow = !s._deleted && daySet.has(s.day_of_week);
        if (isActiveRow) {
          const sStart = toMinutes(s.start_time);
          const sEnd = toMinutes(s.end_time);
          if (sStart < endMin && sEnd > startMin) {
            if (s.id) result.push({ ...s, _deleted: true }); // 未保存(_new)は破棄
            if (sStart < startMin) {
              result.push({
                _tempId: newSlotId(),
                _new: true,
                day_of_week: s.day_of_week,
                start_time: minutesToTime(sStart),
                end_time: minutesToTime(startMin),
                max_bookings: s.max_bookings,
                is_active: s.is_active,
                label: s.label,
                accepted_categories: s.accepted_categories,
              });
            }
            if (sEnd > endMin) {
              result.push({
                _tempId: newSlotId(),
                _new: true,
                day_of_week: s.day_of_week,
                start_time: minutesToTime(endMin),
                end_time: minutesToTime(sEnd),
                max_bookings: s.max_bookings,
                is_active: s.is_active,
                label: s.label,
                accepted_categories: s.accepted_categories,
              });
            }
            continue;
          }
        }
        result.push(s);
      }
      base = result;
    }

    const added: (BookingSlot & { _tempId: string })[] = generated.map((g) => ({
      _tempId: newSlotId(),
      _new: true,
      day_of_week: g.day_of_week as DayOfWeek,
      start_time: g.start_time,
      end_time: g.end_time,
      max_bookings: g.max_bookings,
      is_active: g.is_active,
      label: g.label ?? undefined,
    }));

    // 保存 API の上限（slots ≤ SLOT_SAVE_LIMIT）を超える生成は弾く。
    const nextActiveCount = [...base, ...added].filter((s) => !s._deleted).length;
    if (nextActiveCount > SLOT_SAVE_LIMIT) {
      showToast(
        "error",
        `枠が多すぎます（${nextActiveCount}件）。上限${SLOT_SAVE_LIMIT}件以内になるよう曜日・間隔・時間帯を絞ってください`,
      );
      return;
    }

    setSlots([...base, ...added]);
    showToast("success", `${days.length}曜日に${generated.length / days.length}枠ずつ生成しました（保存で確定）`);
  }

  // ─── カレンダー塗り操作（ミツモア風ドラッグ選択） ───
  // 指定曜日に [startMin, endMin) のスロットを作成。隣接/重複する既存枠は1枠に結合。
  function paintCreate(day: number, startMin: number, endMin: number) {
    setSlots((prev) => {
      let mergeStart = startMin;
      let mergeEnd = endMin;
      let maxBookings = 1;
      let label = "";
      // 結合した既存枠の受入カテゴリを引き継ぐ（制限が黙って外れないように）。
      // いずれかが無制限なら結果も無制限、そうでなければ和集合。
      const mergeCats = new Set<string>();
      let anyUnrestricted = false;
      const result: (BookingSlot & { _tempId: string })[] = [];
      for (const s of prev) {
        const isActiveRow = !s._deleted && s.day_of_week === day;
        if (isActiveRow) {
          const sStart = toMinutes(s.start_time);
          const sEnd = toMinutes(s.end_time);
          // 重複または隣接していれば結合対象
          if (sStart <= mergeEnd && sEnd >= mergeStart) {
            mergeStart = Math.min(mergeStart, sStart);
            mergeEnd = Math.max(mergeEnd, sEnd);
            if (s.max_bookings) maxBookings = s.max_bookings;
            if (s.label) label = s.label;
            if (s.accepted_categories && s.accepted_categories.length > 0) {
              s.accepted_categories.forEach((c) => mergeCats.add(c));
            } else {
              anyUnrestricted = true;
            }
            // 既存枠は取り除く（id 付きは削除マーク、未保存は破棄）
            if (s.id) result.push({ ...s, _deleted: true });
            continue;
          }
        }
        result.push(s);
      }
      result.push({
        _tempId: newSlotId(),
        _new: true,
        day_of_week: day as DayOfWeek,
        start_time: minutesToTime(mergeStart),
        end_time: minutesToTime(mergeEnd),
        max_bookings: maxBookings,
        is_active: true,
        label,
        accepted_categories: anyUnrestricted || mergeCats.size === 0 ? null : [...mergeCats],
      });
      return result;
    });
  }

  // 指定曜日の [startMin, endMin) を削除。途中にかかる枠は分割して残す。
  function paintErase(day: number, startMin: number, endMin: number) {
    setSlots((prev) => {
      const result: (BookingSlot & { _tempId: string })[] = [];
      for (const s of prev) {
        const isActiveRow = !s._deleted && s.day_of_week === day;
        if (isActiveRow) {
          const sStart = toMinutes(s.start_time);
          const sEnd = toMinutes(s.end_time);
          if (sStart < endMin && sEnd > startMin) {
            // 元の枠を取り除く
            if (s.id) result.push({ ...s, _deleted: true });
            // 左側の残り
            if (sStart < startMin) {
              result.push({
                _tempId: newSlotId(),
                _new: true,
                day_of_week: day as DayOfWeek,
                start_time: minutesToTime(sStart),
                end_time: minutesToTime(startMin),
                max_bookings: s.max_bookings,
                is_active: s.is_active,
                label: s.label,
                accepted_categories: s.accepted_categories,
              });
            }
            // 右側の残り
            if (sEnd > endMin) {
              result.push({
                _tempId: newSlotId(),
                _new: true,
                day_of_week: day as DayOfWeek,
                start_time: minutesToTime(endMin),
                end_time: minutesToTime(sEnd),
                max_bookings: s.max_bookings,
                is_active: s.is_active,
                label: s.label,
                accepted_categories: s.accepted_categories,
              });
            }
            continue;
          }
        }
        result.push(s);
      }
      return result;
    });
  }

  // 指定曜日の atMin を含む枠をまるごと削除。
  function eraseSlotAt(day: number, atMin: number) {
    const target = slots.find(
      (s) => !s._deleted && s.day_of_week === day && toMinutes(s.start_time) <= atMin && toMinutes(s.end_time) > atMin,
    );
    if (!target) return;
    paintErase(day, toMinutes(target.start_time), toMinutes(target.end_time));
  }

  // ─── 毎週定休曜日トグル ───
  function toggleWeeklyClosed(dow: number) {
    setWeeklyClosedDows((prev) => {
      const next = new Set(prev);
      if (next.has(dow)) {
        next.delete(dow);
        setClosedDays((cds) =>
          cds.map((c) => (c.type === "weekly" && c.day_of_week === dow ? { ...c, _deleted: true } : c)),
        );
      } else {
        next.add(dow);
        setClosedDays((cds) => {
          const existing = cds.find((c) => c.type === "weekly" && c.day_of_week === dow);
          if (existing) {
            return cds.map((c) => (c.type === "weekly" && c.day_of_week === dow ? { ...c, _deleted: false } : c));
          }
          return [...cds, { _tempId: newClosedId(), _new: true, type: "weekly", day_of_week: dow as DayOfWeek }];
        });
      }
      return next;
    });
  }

  // ─── 特定日定休追加 ───
  function handleAddSpecificClosed() {
    if (!newSpecificDate) {
      showToast("error", "日付を入力してください");
      return;
    }
    const already = closedDays.some((c) => c.type === "specific" && c.closed_date === newSpecificDate && !c._deleted);
    if (already) {
      showToast("error", "すでに登録されている日付です");
      return;
    }
    setClosedDays((prev) => [
      ...prev,
      {
        _tempId: newClosedId(),
        _new: true,
        type: "specific",
        closed_date: newSpecificDate,
        note: newSpecificNote || undefined,
      },
    ]);
    setNewSpecificDate("");
    setNewSpecificNote("");
  }

  function handleDeleteSpecificClosed(tempId: string) {
    setClosedDays((prev) => prev.map((c) => (c._tempId === tempId ? { ...c, _deleted: true } : c)));
  }

  // ─── 保存 ───
  async function handleSave() {
    // 保存時に最新の slots / closedDays を必ず読むため、クロージャではなく ref から読む。
    // 「保存すると初期に戻る」不具合の原因: 保存ボタンは PageHeader→usePublishPageBar 経由で
    // グローバルのページバー(PageBar)へ publish されるが、PageBar は actions を「初回 publish 時の
    // スナップショット」として保持し、slots 変更では再 publish しない（sig に actions 内容が含まれ
    // ないため。無限ループ防止の意図的な設計）。結果、バーに描画される保存ボタンの onClick は
    // ロード直後の handleSave（初期 slots を束縛）に固定され、編集後にクリックしても編集前の枠だけが
    // 保存される（本番では更新後の全行が同一 updated_at・新規 insert 0 件で確認）。ref はレンダーを
    // 跨いで同一参照なので、固定された handleSave からでも .current で最新値が読める（下の useEffect で同期）。
    const curSlots = slotsRef.current;
    const curClosed = closedDaysRef.current;

    // 編集済みスロットも含め、開始 >= 終了の不正な時間帯を弾く
    const invalid = curSlots.some((s) => !s._deleted && toMinutes(s.start_time) >= toMinutes(s.end_time));
    if (invalid) {
      showToast("error", "終了時刻は開始時刻より後にしてください");
      return;
    }
    setSaving(true);
    try {
      // スロットは「今画面に出ている一式」をそのまま送る（id 付きは更新／id 無しは新規）。
      // 削除はサーバが desired set との差分で確定するため、クライアント側の削除ID送信は不要。
      const slotsPayload = curSlots.filter((s) => !s._deleted).map(({ _tempId, _deleted, _new, ...rest }) => rest);

      const closedToSave = curClosed
        .filter((c) => !c._deleted && !c._new)
        .map(({ _tempId, _deleted, _new, ...rest }) => rest);
      const newClosed = curClosed
        .filter((c) => c._new && !c._deleted)
        .map(({ _tempId, _deleted, _new, id, ...rest }) => rest);
      const deletedClosedIds = curClosed.filter((c) => c._deleted && c.id).map((c) => c.id!);

      const body = {
        slots: slotsPayload,
        closed_days: [...closedToSave, ...newClosed],
        deleted_closed_day_ids: deletedClosedIds,
      };

      const res = await fetch("/api/admin/booking-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // サーバの実際のエラー内容を握り潰さず表示する（原因調査のため）。
        const err = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
        throw new Error(err?.message || err?.error || `保存に失敗しました (${res.status})`);
      }
      showToast("success", "設定を保存しました");
      await fetchSettings();
    } catch (e) {
      console.error(e);
      showToast("error", e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  // ─── 表示用 ───
  const activeSlots = slots.filter((s) => !s._deleted);
  const activeSpecificCloseds = closedDays.filter((c) => c.type === "specific" && !c._deleted);

  // ─── レンダリング ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* ヘッダー */}
      <div className="mb-6">
        <PageHeader
          tag="予約設定"
          title="外部予約受付設定"
          description="お客様向け予約ページの受付時間・定休日を管理します"
          actions={
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {saving ? "保存中..." : "保存する"}
            </button>
          }
          tabs={(["slots", "closed"] as const).map((tab) => ({
            key: tab,
            label: tab === "slots" ? "受付時間スロット" : "定休日設定",
          }))}
          activeTab={activeTab}
          onTabSelect={(k) => setActiveTab(k as "slots" | "closed")}
        />
      </div>

      {/* ─── タブ: 受付時間スロット ─── */}
      {activeTab === "slots" && (
        <div className="space-y-4">
          {/* ── 一括登録（〇分毎／〇時間ごとに枠を分割生成） ── */}
          <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5">
            <h3 className="text-sm font-semibold text-primary mb-1">一括登録（枠を分割生成）</h3>
            <p className="text-xs text-secondary mb-4">
              曜日と時間帯・間隔を指定して、受付枠を<strong className="text-primary">〇分毎／〇時間ごと</strong>
              に一括生成します。生成後はグリッド／一覧で微調整できます。
            </p>

            {/* 曜日選択 */}
            <div className="mb-3">
              <label className="block text-xs text-secondary mb-1.5">曜日（複数選択可）</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_NAMES.map((name, dow) => {
                  const on = bulkDays.has(dow);
                  return (
                    <button
                      key={dow}
                      type="button"
                      onClick={() =>
                        setBulkDays((prev) => {
                          const n = new Set(prev);
                          if (n.has(dow)) n.delete(dow);
                          else n.add(dow);
                          return n;
                        })
                      }
                      className={`w-9 h-9 rounded-full text-sm font-bold transition-colors ${
                        on
                          ? dow === 0
                            ? "bg-danger text-white"
                            : dow === 6
                              ? "bg-accent text-white"
                              : "bg-primary text-inverse"
                          : "bg-inset text-secondary hover:bg-surface-active"
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setBulkDays(new Set([1, 2, 3, 4, 5]))}
                  className="ml-2 px-2.5 h-9 rounded-lg text-xs font-medium text-accent hover:bg-accent-dim transition-colors"
                >
                  平日
                </button>
                <button
                  type="button"
                  onClick={() => setBulkDays(new Set([0, 1, 2, 3, 4, 5, 6]))}
                  className="px-2.5 h-9 rounded-lg text-xs font-medium text-accent hover:bg-accent-dim transition-colors"
                >
                  毎日
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-secondary mb-1">開始</label>
                <select value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} className={selectCls}>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">終了</label>
                <select value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} className={selectCls}>
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">枠の間隔</label>
                <select
                  value={bulkInterval}
                  onChange={(e) => setBulkInterval(Number(e.target.value))}
                  className={selectCls}
                >
                  <option value={15}>15分毎</option>
                  <option value={30}>30分毎</option>
                  <option value={45}>45分毎</option>
                  <option value={60}>1時間ごと</option>
                  <option value={90}>1時間30分ごと</option>
                  <option value={120}>2時間ごと</option>
                  <option value={180}>3時間ごと</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-secondary mb-1">同時受付数</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setBulkMax((v) => Math.max(1, v - 1))}
                    className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-medium text-primary">{bulkMax}</span>
                  <button
                    type="button"
                    onClick={() => setBulkMax((v) => Math.min(99, v + 1))}
                    className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                  >
                    ＋
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={handleBulkGenerate}
                className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                一括生成
              </button>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bulkReplace}
                onChange={(e) => setBulkReplace(e.target.checked)}
                className="rounded border-border-default text-accent focus:ring-accent/30"
              />
              対象曜日の同じ時間帯にある既存の枠を置き換える
            </label>
          </div>

          {/* 編集方法トグル: カレンダー / 一覧 */}
          <div className="flex items-center gap-1 rounded-lg border border-border-default bg-inset p-0.5 w-fit">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setSlotView(v)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  slotView === v ? "bg-accent text-white shadow-sm" : "text-secondary hover:text-primary"
                }`}
              >
                {v === "grid" ? "カレンダーで選択" : "一覧で編集"}
              </button>
            ))}
          </div>

          {/* ── カレンダー（ドラッグ/タッチ選択） ── */}
          {slotView === "grid" && (
            <div className="bg-surface rounded-xl border border-border-default shadow-sm p-4">
              <SlotCalendarGrid
                slots={activeSlots as GridSlot[]}
                onCreateRange={paintCreate}
                onEraseRange={paintErase}
                onEraseSlotAt={eraseSlotAt}
              />
              <p className="mt-3 text-xs text-muted">
                同時受付数・ラベル・受入作業（洗車のみ可などの受入可否）を細かく調整したいときは「一覧で編集」に切り替えてください。変更は上部の「保存する」で確定します。
              </p>
            </div>
          )}

          {slotView === "list" && (
            <div className="space-y-4">
              {/* スロット一覧（曜日グループ） */}
              {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((dow) => {
                const daySlots = activeSlots.filter((s) => s.day_of_week === dow);
                const isClosed = weeklyClosedDows.has(dow);
                return (
                  <div
                    key={dow}
                    className={`bg-surface rounded-xl border border-border-default shadow-sm overflow-hidden ${isClosed ? "opacity-50" : ""}`}
                  >
                    {/* 曜日ヘッダー */}
                    <div
                      className={`flex items-center justify-between px-4 py-3 ${
                        dow === 0 ? "bg-danger-dim" : dow === 6 ? "bg-accent-dim" : "bg-inset"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-base ${
                            dow === 0 ? "text-danger" : dow === 6 ? "text-accent" : "text-primary"
                          }`}
                        >
                          {DAY_NAMES[dow]}曜日
                        </span>
                        {isClosed && (
                          <span className="text-xs bg-muted/40 text-secondary px-2 py-0.5 rounded-full">定休日</span>
                        )}
                      </div>
                      <span className="text-xs text-muted">{daySlots.length}スロット</span>
                    </div>

                    {/* スロット行 */}
                    <div className="divide-y divide-border-subtle">
                      {daySlots.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted italic">スロットなし</p>
                      ) : (
                        daySlots.map((slot) => (
                          <div key={slot._tempId} className="px-4 py-3 hover:bg-surface-hover">
                            <div className="flex items-center gap-3">
                              {/* ON/OFFトグル */}
                              <button
                                onClick={() => handleSlotChange(slot._tempId, "is_active", !slot.is_active)}
                                className={`relative w-10 h-5 rounded-full transition-colors ${
                                  slot.is_active ? "bg-accent" : "bg-border-strong"
                                }`}
                              >
                                <span
                                  className={`absolute top-0.5 w-4 h-4 bg-inverse rounded-full shadow transition-transform ${
                                    slot.is_active ? "translate-x-5" : "translate-x-0.5"
                                  }`}
                                />
                              </button>

                              {/* 開始・終了時刻 */}
                              <select
                                value={slot.start_time.slice(0, 5)}
                                onChange={(e) => handleSlotChange(slot._tempId, "start_time", e.target.value)}
                                className={selectCls}
                              >
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                              <span className="text-muted text-sm">〜</span>
                              <select
                                value={slot.end_time.slice(0, 5)}
                                onChange={(e) => handleSlotChange(slot._tempId, "end_time", e.target.value)}
                                className={selectCls}
                              >
                                {TIME_OPTIONS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>

                              {/* 同時受付数 */}
                              <div className="flex items-center gap-1 ml-2">
                                <button
                                  onClick={() =>
                                    handleSlotChange(slot._tempId, "max_bookings", Math.max(1, slot.max_bookings - 1))
                                  }
                                  className="w-6 h-6 rounded-full bg-inset hover:bg-surface-active flex items-center justify-center text-sm font-bold text-primary"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center text-sm font-medium text-primary">
                                  {slot.max_bookings}
                                </span>
                                <button
                                  onClick={() =>
                                    handleSlotChange(slot._tempId, "max_bookings", Math.min(99, slot.max_bookings + 1))
                                  }
                                  className="w-6 h-6 rounded-full bg-inset hover:bg-surface-active flex items-center justify-center text-sm font-bold text-primary"
                                >
                                  ＋
                                </button>
                                <span className="text-xs text-muted ml-1">名</span>
                              </div>

                              {/* ラベル */}
                              <input
                                type="text"
                                value={slot.label ?? ""}
                                onChange={(e) => handleSlotChange(slot._tempId, "label", e.target.value)}
                                placeholder="ラベル（任意）"
                                className={`flex-1 min-w-0 ${inputCls}`}
                              />

                              {/* 削除 */}
                              <button
                                onClick={() => handleDeleteSlot(slot._tempId)}
                                className="text-muted hover:text-danger transition-colors flex-shrink-0"
                                title="削除"
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>

                            {/* 受入作業（大カテゴリ）— 空=すべて受入、複数=複合受付 */}
                            {categoryOptions.length > 0 && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[3.25rem]">
                                <span className="text-[11px] text-muted mr-0.5">受入作業:</span>
                                {(!slot.accepted_categories || slot.accepted_categories.length === 0) && (
                                  <span className="text-[11px] text-secondary">すべて受入</span>
                                )}
                                {categoryOptions.map((cat) => {
                                  const on = (slot.accepted_categories ?? []).includes(cat);
                                  return (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => toggleSlotCategory(slot._tempId, cat)}
                                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                        on
                                          ? "border-accent bg-accent-dim text-accent-text"
                                          : "border-border-default bg-surface text-secondary hover:border-border-strong"
                                      }`}
                                    >
                                      {on ? "✓ " : ""}
                                      {cat}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}

              {/* スロット追加フォーム */}
              <div className="bg-accent-dim border border-accent/20 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-accent-text mb-3">スロットを追加</h3>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-xs text-secondary mb-1">曜日</label>
                    <select
                      value={newSlot.day_of_week ?? 1}
                      onChange={(e) => setNewSlot((p) => ({ ...p, day_of_week: Number(e.target.value) as DayOfWeek }))}
                      className={selectCls}
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={i} value={i}>
                          {d}曜日
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">開始</label>
                    <select
                      value={newSlot.start_time ?? "09:00"}
                      onChange={(e) => setNewSlot((p) => ({ ...p, start_time: e.target.value }))}
                      className={selectCls}
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">終了</label>
                    <select
                      value={newSlot.end_time ?? "10:00"}
                      onChange={(e) => setNewSlot((p) => ({ ...p, end_time: e.target.value }))}
                      className={selectCls}
                    >
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-secondary mb-1">同時受付数</label>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() =>
                          setNewSlot((p) => ({ ...p, max_bookings: Math.max(1, (p.max_bookings ?? 1) - 1) }))
                        }
                        className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                      >
                        −
                      </button>
                      <span className="w-7 text-center text-sm font-medium text-primary">
                        {newSlot.max_bookings ?? 1}
                      </span>
                      <button
                        onClick={() =>
                          setNewSlot((p) => ({ ...p, max_bookings: Math.min(99, (p.max_bookings ?? 1) + 1) }))
                        }
                        className="w-7 h-7 rounded bg-surface border border-border-default hover:bg-surface-hover flex items-center justify-center text-sm font-bold text-primary"
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="block text-xs text-secondary mb-1">ラベル（任意）</label>
                    <input
                      type="text"
                      value={newSlot.label ?? ""}
                      onChange={(e) => setNewSlot((p) => ({ ...p, label: e.target.value }))}
                      placeholder="例: 午前の部"
                      className={`w-full ${inputCls}`}
                    />
                  </div>
                  <button
                    onClick={handleAddSlot}
                    className="flex items-center gap-1 px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    追加
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── タブ: 定休日設定 ─── */}
      {activeTab === "closed" && (
        <div className="space-y-6">
          {/* 毎週定休日 */}
          <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5">
            <h3 className="text-base font-semibold text-primary mb-1">毎週の定休日</h3>
            <p className="text-xs text-secondary mb-4">クリックでオン/オフを切り替えます</p>
            <div className="flex gap-2 flex-wrap">
              {DAY_NAMES.map((name, dow) => (
                <button
                  key={dow}
                  onClick={() => toggleWeeklyClosed(dow)}
                  className={`w-12 h-12 rounded-full font-bold text-sm transition-all ${
                    weeklyClosedDows.has(dow)
                      ? dow === 0
                        ? "bg-danger text-white shadow-md scale-105"
                        : dow === 6
                          ? "bg-accent text-white shadow-md scale-105"
                          : "bg-primary text-inverse shadow-md scale-105"
                      : "bg-inset text-secondary hover:bg-surface-active"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
            {weeklyClosedDows.size > 0 && (
              <p className="mt-3 text-sm text-secondary">
                毎週
                {[...weeklyClosedDows]
                  .sort()
                  .map((d) => DAY_NAMES[d])
                  .join("・")}
                曜日は定休日です
              </p>
            )}
          </div>

          {/* 特定日定休 */}
          <div className="bg-surface rounded-xl border border-border-default shadow-sm p-5">
            <h3 className="text-base font-semibold text-primary mb-1">特定日の定休</h3>
            <p className="text-xs text-secondary mb-4">年末年始・祝日・臨時休業などを個別に設定します</p>

            {/* 追加フォーム */}
            <div className="flex flex-wrap gap-3 mb-4 bg-accent-dim border border-accent/20 rounded-lg p-4">
              <div>
                <label className="block text-xs text-secondary mb-1">日付</label>
                <input
                  type="date"
                  value={newSpecificDate}
                  onChange={(e) => setNewSpecificDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-secondary mb-1">備考（任意）</label>
                <input
                  type="text"
                  value={newSpecificNote}
                  onChange={(e) => setNewSpecificNote(e.target.value)}
                  placeholder="例: 年末年始"
                  className={`w-full ${inputCls}`}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddSpecificClosed}
                  className="flex items-center gap-1 px-4 py-1.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  追加
                </button>
              </div>
            </div>

            {/* 登録済み特定日一覧 */}
            {activeSpecificCloseds.length === 0 ? (
              <p className="text-sm text-muted italic py-4 text-center">特定日の定休はありません</p>
            ) : (
              <div className="divide-y divide-border-subtle">
                {activeSpecificCloseds
                  .sort((a, b) => (a.closed_date ?? "").localeCompare(b.closed_date ?? ""))
                  .map((cd) => (
                    <div
                      key={cd._tempId}
                      className="flex items-center justify-between py-3 hover:bg-surface-hover px-2 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-inset flex items-center justify-center">
                          <svg
                            className="w-4 h-4 text-secondary"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                            />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-primary">{cd.closed_date?.replace(/-/g, "/")}</p>
                          {cd.note && <p className="text-xs text-secondary">{cd.note}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSpecificClosed(cd._tempId)}
                        className="text-muted hover:text-danger transition-colors"
                        title="削除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 z-50 transition-all ${
            toast.type === "success" ? "bg-accent text-white" : "bg-danger text-white"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
