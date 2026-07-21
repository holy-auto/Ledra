"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface Widget {
  id: string;
  label: string;
  content: ReactNode;
  /** Default visible state */
  defaultVisible?: boolean;
}

interface WidgetState {
  visible: Record<string, boolean>;
  order: string[];
}

const STORAGE_KEY_PREFIX = "dashboard-widgets-";

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                                */
/* ------------------------------------------------------------------ */
function isWidgetState(value: unknown): value is WidgetState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.order) &&
    v.order.every((id) => typeof id === "string") &&
    new Set(v.order).size === v.order.length &&
    !!v.visible &&
    typeof v.visible === "object" &&
    !Array.isArray(v.visible) &&
    Object.values(v.visible).every((visible) => typeof visible === "boolean")
  );
}

function loadState(portal: string): WidgetState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + portal);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isWidgetState(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function saveState(portal: string, state: WidgetState) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + portal, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Customize modal                                                    */
/* ------------------------------------------------------------------ */
function CustomizeModal({
  widgets,
  state,
  onToggle,
  onMoveUp,
  onMoveDown,
  onClose,
}: {
  widgets: Widget[];
  state: WidgetState;
  onToggle: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onClose: () => void;
}) {
  const orderedWidgets = state.order.map((id) => widgets.find((w) => w.id === id)).filter(Boolean) as Widget[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-[var(--bg-elevated)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h3 className="text-base font-semibold text-primary">ウィジェット設定</h3>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {orderedWidgets.map((w, i) => (
            <div
              key={w.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-hover transition-colors"
            >
              <input
                type="checkbox"
                checked={state.visible[w.id] ?? true}
                onChange={() => onToggle(w.id)}
                className="accent-[var(--accent-blue)]"
              />
              <span className="flex-1 text-sm text-primary">{w.label}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onMoveUp(w.id)}
                  disabled={i === 0}
                  className="p-1 text-muted hover:text-primary disabled:opacity-30 transition-colors"
                  aria-label="上に移動"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                  </svg>
                </button>
                <button
                  onClick={() => onMoveDown(w.id)}
                  disabled={i === orderedWidgets.length - 1}
                  className="p-1 text-muted hover:text-primary disabled:opacity-30 transition-colors"
                  aria-label="下に移動"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border-subtle px-5 py-3 text-right">
          <button onClick={onClose} className="btn-primary text-sm px-4 py-2">
            完了
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function DashboardWidgets({ portal, widgets }: { portal: string; widgets: Widget[] }) {
  const [state, setState] = useState<WidgetState>({
    visible: {},
    order: widgets.map((w) => w.id),
  });
  const [showCustomize, setShowCustomize] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load persisted state
  useEffect(() => {
    const persisted = loadState(portal);
    if (persisted) {
      // Merge with any new widgets not in persisted state
      const allIds = new Set(widgets.map((w) => w.id));
      const order = [...persisted.order.filter((id) => allIds.has(id))];
      for (const w of widgets) {
        if (!order.includes(w.id)) order.push(w.id);
      }
      setState({
        visible: {
          ...Object.fromEntries(widgets.map((w) => [w.id, w.defaultVisible !== false])),
          ...persisted.visible,
        },
        order,
      });
    } else {
      setState({
        visible: Object.fromEntries(widgets.map((w) => [w.id, w.defaultVisible !== false])),
        order: widgets.map((w) => w.id),
      });
    }
    setInitialized(true);
  }, [portal, widgets]);

  // Save on change
  useEffect(() => {
    if (initialized) saveState(portal, state);
  }, [portal, state, initialized]);

  const onToggle = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      visible: { ...prev.visible, [id]: !(prev.visible[id] ?? true) },
    }));
  }, []);

  const onMoveUp = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.order.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev.order];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return { ...prev, order: next };
    });
  }, []);

  const onMoveDown = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.order.indexOf(id);
      if (idx < 0 || idx >= prev.order.length - 1) return prev;
      const next = [...prev.order];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { ...prev, order: next };
    });
  }, []);

  if (!initialized) return null;

  const visibleWidgets = state.order
    .filter((id) => state.visible[id] ?? true)
    .map((id) => widgets.find((w) => w.id === id))
    .filter(Boolean) as Widget[];

  return (
    <>
      {/* Customize button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCustomize(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-primary hover:bg-surface-hover transition-colors"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
            />
          </svg>
          カスタマイズ
        </button>
      </div>

      {/* Widgets */}
      {visibleWidgets.map((w) => (
        <div key={w.id}>{w.content}</div>
      ))}

      {/* Customize modal */}
      {showCustomize && (
        <CustomizeModal
          widgets={widgets}
          state={state}
          onToggle={onToggle}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onClose={() => setShowCustomize(false)}
        />
      )}
    </>
  );
}
