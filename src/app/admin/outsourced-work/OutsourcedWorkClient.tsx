"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { formatDate, formatDateTime } from "@/lib/format";
import { outsourcedWorkStateLabel } from "@/lib/domain/labels";
import type { OutsourcedWorkState } from "@/lib/domain/states";
import type { WorkRequestDetail, WorkRequestRow } from "@/lib/outsourcedWork/service";

/**
 * 外注施工履歴の管理画面（MVP）。一覧 → 詳細 → 「今起こせる次のアクション」を API の
 * next_actions からそのまま出す。何が押せるかは画面で決めず、rules.ts の判定に従う。
 *
 * ponytail: 写真はストレージパスの文字列入力（アップロード UI は既存の証跡フローに相乗りする
 * 段階で足す）。担当者割当・指名は user_id 入力。実運用確認（AC-030）で不足が出た所から直す。
 */

type Msg = { text: string; ok: boolean } | null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.message ?? j?.error ?? "エラーが発生しました。");
  return j as T;
}

const ACTOR_LABEL: Record<string, string> = {
  client_store_staff: "発注元店舗担当者",
  client_admin: "発注元管理者",
  contractor_worker: "施工担当者",
  contractor_admin: "施工会社管理者",
  reviewer: "確認者",
  viewer: "閲覧者",
  system: "システム",
};

const EVENT_LABEL: Record<string, string> = {
  REQUEST_CREATED: "依頼作成",
  PART_ADDED: "部品追加",
  STATUS_TRANSITION: "状態遷移",
  VERIFICATION: "三方向照合",
  WORKER_ASSIGNED: "担当者割当",
  CORRECTION: "訂正",
  POST_COMPLETION_REWORK_REQUESTED: "完了後再施工 申請",
  POST_COMPLETION_REWORK_APPROVED: "完了後再施工 承認",
  POST_COMPLETION_REWORK_RECORDED: "完了後再施工 記録",
  EVIDENCE_GENERATED: "証明データ生成",
};

const VERIFICATION_LABEL: Record<string, string> = { MATCH: "一致", NEEDS_REVIEW: "要確認", MISMATCH: "不一致" };

function StatusBadge({ status }: { status: OutsourcedWorkState }) {
  const tone =
    status === "COMPLETED"
      ? "bg-success/15 text-success"
      : status === "CANCELED" || status === "RECEIPT_REJECTED"
        ? "bg-red-500/15 text-red-500"
        : /SHORTAGE|MISMATCH|DAMAGE|INTERRUPTED|EXCEPTION|RETURNED|HOLD/.test(status)
          ? "bg-amber-500/15 text-amber-600"
          : "bg-primary/10 text-primary";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {outsourcedWorkStateLabel(status)}
    </span>
  );
}

export default function OutsourcedWorkClient({ tenantId }: { tenantId: string }) {
  const [requests, setRequests] = useState<WorkRequestRow[]>([]);
  const [contractors, setContractors] = useState<{ tenant_id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkRequestDetail | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [showCreate, setShowCreate] = useState(false);

  const loadList = useCallback(async () => {
    const j = await api<{ requests: WorkRequestRow[]; contractors: { tenant_id: string; name: string }[] }>(
      "/api/admin/outsourced-work",
    );
    setRequests(j.requests);
    setContractors(j.contractors);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    setDetail(await api<WorkRequestDetail>(`/api/admin/outsourced-work/${id}`));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: initial fetch; setState runs after await, not synchronously
    loadList().catch((e) => setMsg({ text: e.message, ok: false }));
  }, [loadList]);

  const select = (id: string) => {
    setSelected(id);
    loadDetail(id).catch((e) => setMsg({ text: e.message, ok: false }));
  };
  const refresh = async () => {
    await loadList();
    if (selected) await loadDetail(selected);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        tag="OUTSOURCED WORK"
        title="外注施工履歴"
        description="支給部品の準備・引渡し・受領・照合・施工・完了確認までを、発注元と施工事業者で共有します"
        actions={
          contractors.length > 0 ? (
            <button type="button" className="btn-primary text-sm px-4 py-2" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? "閉じる" : "作業依頼を作成"}
            </button>
          ) : null
        }
      />
      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-red-500"}`}>{msg.text}</div>}

      {showCreate && (
        <CreateForm
          contractors={contractors}
          onDone={async (id) => {
            setShowCreate(false);
            setMsg({ text: "作業依頼を作成しました。", ok: true });
            await loadList();
            select(id);
          }}
          onError={(text) => setMsg({ text, ok: false })}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section className="glass-card p-4 space-y-2">
          <h2 className="text-sm font-semibold text-primary">作業依頼</h2>
          {requests.length === 0 ? (
            <p className="text-xs text-muted">
              まだ作業依頼がありません。
              {contractors.length === 0 &&
                " 施工事業者は「スタッフ」の外注職人に連携コードで繋いだテナントから選びます。"}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => select(r.id)}
                    className={`w-full text-left py-2 px-1 rounded hover:bg-primary/5 ${selected === r.id ? "bg-primary/10" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{r.vehicle_label || r.vin}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-xs text-secondary truncate">
                      {r.client_tenant_id === tenantId ? "発注" : "受注"} · {r.work_description} · 期限{" "}
                      {formatDate(r.due_date)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-card p-4">
          {detail ? (
            <Detail detail={detail} onChanged={refresh} setMsg={setMsg} />
          ) : (
            <p className="text-xs text-muted">左の一覧から作業依頼を選んでください。</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ── 作成 ──

function CreateForm({
  contractors,
  onDone,
  onError,
}: {
  contractors: { tenant_id: string; name: string }[];
  onDone: (id: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    contractor_tenant_id: contractors[0]?.tenant_id ?? "",
    vin: "",
    vehicle_label: "",
    work_description: "",
    due_date: "",
    order_number: "",
    customer_note: "",
    designated_approver_user_ids: "",
    designated_reviewer_user_ids: "",
  });
  const [parts, setParts] = useState([{ part_number: "", part_name: "", quantity: 1 }]);
  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const ids = (s: string) =>
    s
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const submit = async () => {
    setBusy(true);
    try {
      const j = await api<{ request: WorkRequestRow }>("/api/admin/outsourced-work", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          vehicle_label: form.vehicle_label || null,
          due_date: form.due_date || null,
          order_number: form.order_number || null,
          customer_note: form.customer_note || null,
          designated_approver_user_ids: ids(form.designated_approver_user_ids),
          designated_reviewer_user_ids: ids(form.designated_reviewer_user_ids),
          parts: parts.filter((p) => p.part_number && p.part_name).map((p) => ({ ...p, quantity: Number(p.quantity) })),
        }),
      });
      await onDone(j.request.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-card p-5 space-y-3">
      <h2 className="text-sm font-semibold text-primary">作業依頼を作成（AC-001）</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          施工事業者
          <select
            className="input-field w-full"
            value={form.contractor_tenant_id}
            onChange={set("contractor_tenant_id")}
          >
            {contractors.map((c) => (
              <option key={c.tenant_id} value={c.tenant_id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          作業期限
          <input type="date" className="input-field w-full" value={form.due_date} onChange={set("due_date")} />
        </label>
        <label className="text-xs">
          VIN / 車台番号
          <input className="input-field w-full font-mono" value={form.vin} onChange={set("vin")} />
        </label>
        <label className="text-xs">
          車両（表示名）
          <input
            className="input-field w-full"
            value={form.vehicle_label}
            onChange={set("vehicle_label")}
            placeholder="例: アウトランダー 白"
          />
        </label>
        <label className="text-xs sm:col-span-2">
          作業内容
          <textarea
            className="input-field w-full"
            rows={2}
            value={form.work_description}
            onChange={set("work_description")}
          />
        </label>
        <label className="text-xs">
          発注番号
          <input className="input-field w-full" value={form.order_number} onChange={set("order_number")} />
        </label>
        <label className="text-xs">
          顧客情報（証明データには含めません）
          <input className="input-field w-full" value={form.customer_note} onChange={set("customer_note")} />
        </label>
        <label className="text-xs">
          例外承認者に指名する user_id（カンマ区切り・任意）
          <input
            className="input-field w-full font-mono"
            value={form.designated_approver_user_ids}
            onChange={set("designated_approver_user_ids")}
          />
        </label>
        <label className="text-xs">
          確認者に指名する user_id（カンマ区切り・任意）
          <input
            className="input-field w-full font-mono"
            value={form.designated_reviewer_user_ids}
            onChange={set("designated_reviewer_user_ids")}
          />
        </label>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold">支給部品</div>
        {parts.map((p, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_80px] gap-2">
            <input
              className="input-field font-mono"
              placeholder="品番"
              value={p.part_number}
              onChange={(e) => setParts((a) => a.map((x, j) => (j === i ? { ...x, part_number: e.target.value } : x)))}
            />
            <input
              className="input-field"
              placeholder="部品名"
              value={p.part_name}
              onChange={(e) => setParts((a) => a.map((x, j) => (j === i ? { ...x, part_name: e.target.value } : x)))}
            />
            <input
              type="number"
              min={1}
              className="input-field"
              value={p.quantity}
              onChange={(e) =>
                setParts((a) => a.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="text-xs text-primary underline"
          onClick={() => setParts((a) => [...a, { part_number: "", part_name: "", quantity: 1 }])}
        >
          + 部品を追加
        </button>
      </div>
      <button
        type="button"
        disabled={busy || !form.vin || !form.work_description || !form.contractor_tenant_id}
        onClick={submit}
        className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
      >
        {busy ? "作成中…" : "作成する"}
      </button>
    </section>
  );
}

// ── 詳細 ──

function Detail({
  detail,
  onChanged,
  setMsg,
}: {
  detail: WorkRequestDetail;
  onChanged: () => Promise<void>;
  setMsg: (m: Msg) => void;
}) {
  const { request: r, actor, parts, receipt_attempts, events, next_actions, operations } = detail;
  const [action, setAction] = useState<OutsourcedWorkState | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    try {
      await fn();
      setMsg({ text: okText, ok: true });
      setAction(null);
      await onChanged();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };
  const post = (path: string, body: unknown) =>
    api(`/api/admin/outsourced-work/${r.id}${path}`, { method: "POST", body: JSON.stringify(body) });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold">{r.vehicle_label || r.vin}</div>
          <div className="text-xs text-secondary font-mono">{r.vin}</div>
          <div className="text-sm mt-1">{r.work_description}</div>
          <div className="text-xs text-muted mt-1">
            期限 {formatDate(r.due_date)} · 作成 {formatDateTime(r.created_at)} · あなたの立場:{" "}
            {ACTOR_LABEL[actor.role]}
            {actor.designatedApprover && "（例外承認者）"}
          </div>
        </div>
        <StatusBadge status={r.status} />
      </div>

      {r.evidence_hash && (
        <div className="text-xs">
          証明データハッシュ: <span className="font-mono break-all">{r.evidence_hash}</span>（
          {formatDateTime(r.evidence_generated_at)}）
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold text-primary mb-1">支給部品（{parts.length}）</h3>
        <table className="w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="text-left">品番</th>
              <th className="text-left">部品名</th>
              <th className="text-right">指定数量</th>
              <th className="text-left">準備</th>
              <th className="text-left">引渡し</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.id}>
                <td className="font-mono">{p.part_number}</td>
                <td>{p.part_name}</td>
                <td className="text-right">{p.quantity}</td>
                <td>{formatDate(p.prepared_at)}</td>
                <td>{formatDate(p.handed_over_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {receipt_attempts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-primary mb-1">受領試行</h3>
          <ul className="text-xs space-y-1">
            {receipt_attempts.map((a) => (
              <li key={a.id}>
                #{a.attempt_no} {a.result === "accepted" ? "受領済み" : a.result === "rejected" ? "受領拒否" : "確認中"}{" "}
                · 開始 {formatDateTime(a.started_at)}
                {a.received_at && ` · 受領 ${formatDateTime(a.received_at)}`}
                {a.rejection_reason && ` · 拒否理由: ${a.rejection_reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {next_actions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-primary">次のアクション</h3>
          <div className="flex flex-wrap gap-2">
            {next_actions.map((a) => (
              <button
                key={a.to}
                type="button"
                className={`text-xs px-3 py-1.5 rounded border ${action === a.to ? "bg-primary text-white" : "border-border"}`}
                onClick={() => setAction(action === a.to ? null : a.to)}
              >
                → {outsourcedWorkStateLabel(a.to)}
              </button>
            ))}
          </div>
          {action && (
            <TransitionForm
              key={action}
              to={action}
              from={r.status}
              returnTargets={next_actions.find((a) => a.to === action)?.return_targets ?? []}
              parts={parts}
              busy={busy}
              onSubmit={(body) =>
                run(() => post("/transition", body), `${outsourcedWorkStateLabel(action)} へ進めました。`)
              }
            />
          )}
        </div>
      )}

      <EventForms r={r} operations={operations} actorRole={actor.role} busy={busy} post={post} run={run} />

      <div>
        <h3 className="text-xs font-semibold text-primary mb-1">履歴（{events.length}）</h3>
        <ol className="text-xs space-y-1 max-h-96 overflow-auto">
          {events.map((e) => (
            <li key={e.id} className="border-l-2 border-border pl-2">
              <span className="text-muted">{formatDateTime(e.created_at)}</span> ·{" "}
              {EVENT_LABEL[e.event_type] ?? e.event_type}
              {e.from_status && e.to_status && (
                <>
                  {" "}
                  {outsourcedWorkStateLabel(e.from_status as OutsourcedWorkState)} →{" "}
                  {outsourcedWorkStateLabel(e.to_status as OutsourcedWorkState)}
                </>
              )}
              {e.event_type === "VERIFICATION" &&
                ` 結果: ${VERIFICATION_LABEL[String(e.payload.result)] ?? String(e.payload.result)}`}{" "}
              <span className="text-muted">[{ACTOR_LABEL[e.actor_role] ?? e.actor_role}]</span>
              {e.reason && <div className="text-secondary">理由: {e.reason}</div>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function TransitionForm({
  to,
  from,
  returnTargets,
  parts,
  busy,
  onSubmit,
}: {
  to: OutsourcedWorkState;
  from: OutsourcedWorkState;
  returnTargets: readonly OutsourcedWorkState[];
  parts: WorkRequestDetail["parts"];
  busy: boolean;
  onSubmit: (body: unknown) => void;
}) {
  const [reason, setReason] = useState("");
  const [returnTo, setReturnTo] = useState<string>(returnTargets[0] ?? "");
  const [lines, setLines] = useState(
    parts.map((p) => ({
      part_id: p.id,
      received_quantity: p.quantity,
      actual_part_number: p.part_number,
      appearance: "良好",
      packaging: "良好",
    })),
  );
  const [signature, setSignature] = useState("");
  const [unfinished, setUnfinished] = useState("");
  const needsLines = to === "RECEIVED" && from === "RECEIPT_IN_REVIEW";
  const needsWork = to === "WORK_COMPLETED" || to === "REWORK_COMPLETED";

  const submit = () => {
    const payload: Record<string, unknown> = {};
    if (needsLines) payload.lines = lines.map((l) => ({ ...l, received_quantity: Number(l.received_quantity) }));
    if (needsWork) {
      payload.used_parts = parts.map((p) => ({ part_id: p.id, part_number: p.part_number, quantity: p.quantity }));
      payload.signature = signature;
      payload.unfinished_work = unfinished || null;
    }
    if (to === "MATCHED") payload.verification_result = "MATCH";
    onSubmit({ to, reason: reason || null, return_to: returnTargets.length > 0 ? returnTo : null, payload });
  };

  return (
    <div className="rounded border border-border p-3 space-y-2 text-xs">
      {returnTargets.length > 0 && (
        <label className="block">
          復帰先（発生工程に応じて許可されたものだけ）
          <select className="input-field w-full" value={returnTo} onChange={(e) => setReturnTo(e.target.value)}>
            {returnTargets.map((t) => (
              <option key={t} value={t}>
                {outsourcedWorkStateLabel(t)}
              </option>
            ))}
          </select>
        </label>
      )}
      {needsLines &&
        lines.map((l, i) => (
          <div key={l.part_id} className="grid grid-cols-[1fr_80px_1fr_1fr] gap-2 items-center">
            <span className="font-mono">{parts[i]?.part_number}</span>
            <input
              type="number"
              min={0}
              className="input-field"
              value={l.received_quantity}
              onChange={(e) =>
                setLines((a) => a.map((x, j) => (j === i ? { ...x, received_quantity: Number(e.target.value) } : x)))
              }
            />
            <input
              className="input-field font-mono"
              placeholder="現物品番"
              value={l.actual_part_number}
              onChange={(e) =>
                setLines((a) => a.map((x, j) => (j === i ? { ...x, actual_part_number: e.target.value } : x)))
              }
            />
            <input
              className="input-field"
              placeholder="外観 / 梱包"
              value={l.appearance}
              onChange={(e) =>
                setLines((a) =>
                  a.map((x, j) => (j === i ? { ...x, appearance: e.target.value, packaging: e.target.value } : x)),
                )
              }
            />
          </div>
        ))}
      {needsWork && (
        <>
          <label className="block">
            未実施作業（あれば）
            <input className="input-field w-full" value={unfinished} onChange={(e) => setUnfinished(e.target.value)} />
          </label>
          <label className="block">
            施工者署名（氏名）
            <input className="input-field w-full" value={signature} onChange={(e) => setSignature(e.target.value)} />
          </label>
        </>
      )}
      <label className="block">
        理由・コメント
        <textarea className="input-field w-full" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={busy || (needsWork && !signature)}
        onClick={submit}
        className="btn-primary text-xs px-3 py-1.5 disabled:opacity-60"
      >
        {outsourcedWorkStateLabel(to)} にする
      </button>
    </div>
  );
}

function EventForms({
  r,
  operations,
  actorRole,
  busy,
  post,
  run,
}: {
  r: WorkRequestRow;
  operations: WorkRequestDetail["operations"];
  actorRole: string;
  busy: boolean;
  post: (path: string, body: unknown) => Promise<unknown>;
  run: (fn: () => Promise<unknown>, okText: string) => Promise<void>;
}) {
  const [verification, setVerification] = useState<{ result: string; reason: string }>({ result: "MATCH", reason: "" });
  const [workerId, setWorkerId] = useState("");
  const [text, setText] = useState("");
  const has = (op: WorkRequestDetail["operations"][number]) => operations.includes(op);
  const items: React.ReactNode[] = [];

  if (has("verification:record") && r.status === "RECEIVED") {
    items.push(
      <div key="v" className="flex flex-wrap gap-2 items-end">
        <label>
          三方向照合（車両・作業指示・現物）
          <select
            className="input-field"
            value={verification.result}
            onChange={(e) => setVerification((v) => ({ ...v, result: e.target.value }))}
          >
            {Object.entries(VERIFICATION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input-field"
          placeholder="理由（要確認・不一致は必須）"
          value={verification.reason}
          onChange={(e) => setVerification((v) => ({ ...v, reason: e.target.value }))}
        />
        <button
          type="button"
          disabled={busy}
          className="btn-primary text-xs px-3 py-1.5"
          onClick={() =>
            run(
              () => post("/events", { type: "VERIFICATION", ...verification, reason: verification.reason || null }),
              "照合結果を記録しました。",
            )
          }
        >
          記録
        </button>
      </div>,
    );
  }
  if (has("worker:assign") && r.status !== "COMPLETED" && r.status !== "CANCELED") {
    items.push(
      <div key="w" className="flex flex-wrap gap-2 items-end">
        <label>
          施工担当者（user_id）
          <input className="input-field font-mono" value={workerId} onChange={(e) => setWorkerId(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={busy || !workerId}
          className="btn-primary text-xs px-3 py-1.5"
          onClick={() =>
            run(() => post("/events", { type: "WORKER_ASSIGNED", user_id: workerId }), "担当者を割り当てました。")
          }
        >
          割当
        </button>
      </div>,
    );
  }
  if (r.status === "COMPLETED") {
    if (has("correction:record"))
      items.push(
        <div key="c" className="flex flex-wrap gap-2 items-end">
          <input
            className="input-field"
            placeholder="訂正内容（対象と理由）"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            disabled={busy || !text}
            className="btn-primary text-xs px-3 py-1.5"
            onClick={() =>
              run(
                () => post("/events", { type: "CORRECTION", target: "record", reason: text }),
                "訂正イベントを追記しました。",
              )
            }
          >
            訂正を追記
          </button>
        </div>,
      );
    if (has("rework_after_completion:request"))
      items.push(
        <button
          key="rr"
          type="button"
          disabled={busy || !text}
          className="text-xs px-3 py-1.5 rounded border border-border"
          onClick={() =>
            run(
              () => post("/events", { type: "POST_COMPLETION_REWORK_REQUESTED", reason: text }),
              "完了後再施工を申請しました。",
            )
          }
        >
          完了後再施工を申請（上の欄を理由に使います）
        </button>,
      );
    if (actorRole === "client_admin" || actorRole === "reviewer")
      items.push(
        <button
          key="ra"
          type="button"
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded border border-border"
          onClick={() =>
            run(
              () => post("/events", { type: "POST_COMPLETION_REWORK_APPROVED", reason: text || null }),
              "完了後再施工を承認しました。",
            )
          }
        >
          完了後再施工を承認
        </button>,
      );
    if (has("rework_after_completion:record"))
      items.push(
        <button
          key="rc"
          type="button"
          disabled={busy || !text}
          className="text-xs px-3 py-1.5 rounded border border-border"
          onClick={() =>
            run(
              () =>
                post("/events", {
                  type: "POST_COMPLETION_REWORK_RECORDED",
                  reason: text,
                  signature: "recorded",
                  used_parts: [],
                }),
              "完了後再施工を記録しました。",
            )
          }
        >
          完了後再施工を記録
        </button>,
      );
  }
  if (has("evidence:generate") && (r.status === "COMPLETED" || r.status === "CANCELED"))
    items.push(
      <button
        key="e"
        type="button"
        disabled={busy}
        className="btn-primary text-xs px-3 py-1.5"
        onClick={() => run(() => post("/evidence", {}), "証明データを生成しました。")}
      >
        証明データを生成（ハッシュ付与・改ざん検知連携）
      </button>,
    );

  if (items.length === 0) return null;
  return (
    <div className="space-y-2 text-xs">
      <h3 className="font-semibold text-primary">記録・操作</h3>
      {items}
    </div>
  );
}
