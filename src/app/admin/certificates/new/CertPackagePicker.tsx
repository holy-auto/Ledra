"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatJpy } from "@/lib/format";
import HelpTooltip from "@/components/ui/HelpTooltip";
import {
  SERVICE_PACKAGE_CATEGORIES,
  SERVICE_PACKAGE_CATEGORY_LABEL,
  type ServicePackageCategory,
  type PriceStrategy,
} from "@/lib/validations/service-package";

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  category: ServicePackageCategory;
  price_strategy: PriceStrategy;
  fixed_price: number | null;
  recommended_template_id: string | null;
  is_archived: boolean;
  item_count: number;
};

type ExpandResponse = {
  package: {
    id: string;
    name: string;
    category: ServicePackageCategory;
    price_strategy: PriceStrategy;
    recommended_template_id: string | null;
  };
  items: Array<{
    menu_item_id: string;
    name: string;
    unit_price: number;
    quantity: number;
    line_total: number;
  }>;
  items_total: number;
  price: number | null;
};

type CertTemplate = { id: string; name: string; category?: string | null };

type Props = {
  /** 既存テンプレートリスト (CertNewFormWrapper 経由で SSR 済み) */
  templates: CertTemplate[];
  /** 現在 URL ?tid= で指定されているテンプレID */
  currentTemplateId: string;
};

/**
 * 証明書発行画面のパッケージ選択 UI。
 *
 * - クリックすると施工パッケージを選択するモーダルが開く
 * - 選んだパッケージは `?pid=...` に保存され、フォーム送信時にスナップショット
 *   として `package_id` / `package_snapshot_json` フィールドに乗る。
 * - コンテンツテンプレ未指定 (`tid` が空 or デフォルト) の場合に限り、
 *   選択時点でパッケージの recommended_template_id (なければカテゴリ一致テンプレ)
 *   を自動選択して `?tid=...&pid=...` に navigate する。
 *   既にユーザがテンプレを選択している場合は上書きしない。
 * - 施工内容 (textarea[name='content_free_text']) を空のときに限り
 *   パッケージ items のサマリで初期化する (既存入力は壊さない)。
 *
 * 案件側 (PR-B) で適用済の場合、案件の menu_items_json はパッケージから
 * 派生しているが、本コンポーネントは reservations を触らない。証明書発行
 * 時の事前情報入力に専念する (= e2e 仕様の「再展開されないこと」)。
 */
export default function CertPackagePicker({ templates, currentTemplateId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialPid = searchParams.get("pid") ?? "";
  const [appliedSnapshot, setAppliedSnapshot] = useState<ExpandResponse | null>(null);
  const hydratedFromUrl = useRef(false);

  const { data: pkgList } = useSWR<{ packages: PackageRow[] }>(
    open || initialPid ? "/api/admin/service-packages" : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // URL ?pid= が指定されていたら 1 度だけ snapshot を取得して fingerprint 表示
  useEffect(() => {
    if (!initialPid || hydratedFromUrl.current) return;
    hydratedFromUrl.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/service-packages/${initialPid}/expand`);
        if (!res.ok) return;
        const j = (await res.json()) as ExpandResponse;
        setAppliedSnapshot(j);
      } catch {
        /* ignore */
      }
    })();
  }, [initialPid]);

  const grouped = useMemo(() => {
    const out = new Map<ServicePackageCategory, PackageRow[]>();
    for (const p of pkgList?.packages ?? []) {
      if (p.is_archived) continue;
      const arr = out.get(p.category) ?? [];
      arr.push(p);
      out.set(p.category, arr);
    }
    return out;
  }, [pkgList]);

  /**
   * テンプレIDの自動選択ロジック:
   * 1. package.recommended_template_id があり、かつテンプレ一覧に存在
   * 2. それ以外でテンプレ一覧から package.category が一致するものを最初の 1 件
   * 3. 該当なしなら null (現在の tid を維持)
   */
  const autoSelectTemplateId = (pkg: ExpandResponse["package"]): string | null => {
    if (pkg.recommended_template_id && templates.some((t) => t.id === pkg.recommended_template_id)) {
      return pkg.recommended_template_id;
    }
    const match = templates.find((t) => (t.category ?? null) === pkg.category);
    return match?.id ?? null;
  };

  const fillContentFreeText = (snapshot: ExpandResponse) => {
    const ta = document.querySelector<HTMLTextAreaElement>("textarea[name='content_free_text']");
    if (!ta) return;
    if (ta.value && ta.value.trim().length > 0) return; // 既存入力は壊さない
    const lines = [`【${snapshot.package.name}】`];
    for (const it of snapshot.items) {
      lines.push(`・${it.name} (${it.quantity} × ${formatJpy(it.unit_price)}) = ${formatJpy(it.line_total)}`);
    }
    if (snapshot.items_total > 0) {
      lines.push("", `合計: ${formatJpy(snapshot.items_total)}`);
    }
    ta.value = lines.join("\n");
    // React 用にイベント発火 (controlled でなくとも保険として)
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const pickPackage = async (pkgId: string) => {
    setPicking(pkgId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/service-packages/${pkgId}/expand`);
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? `HTTP ${res.status}`);
      const snapshot = j as ExpandResponse;
      setAppliedSnapshot(snapshot);

      // 自動テンプレ選択: ユーザが既にテンプレを選択済の場合は触らない
      const userExplicitlyChose =
        currentTemplateId && currentTemplateId !== "" && currentTemplateId !== templates[0]?.id;
      let nextTid = currentTemplateId;
      if (!userExplicitlyChose) {
        const auto = autoSelectTemplateId(snapshot.package);
        if (auto) nextTid = auto;
      }

      // URL を更新 (pid + 必要なら tid)。client-side navigation で SSR 再ロード。
      const sp = new URLSearchParams(Array.from(searchParams.entries()));
      sp.set("pid", pkgId);
      if (nextTid) sp.set("tid", nextTid);
      const navigationNeeded = nextTid !== currentTemplateId;
      if (navigationNeeded) {
        router.replace(`/admin/certificates/new?${sp.toString()}`);
      } else {
        // tid を変えない場合は再 SSR せず、URL だけ書き換える
        window.history.replaceState({}, "", `/admin/certificates/new?${sp.toString()}`);
      }

      fillContentFreeText(snapshot);
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  };

  const clearPackage = () => {
    setAppliedSnapshot(null);
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    sp.delete("pid");
    window.history.replaceState({}, "", `/admin/certificates/new?${sp.toString()}`);
  };

  return (
    <div className="glass-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">PACKAGE</div>
          <div className="mt-1 text-base font-semibold text-primary inline-flex items-center gap-1.5">
            施工パッケージから取り込む (任意)
            <HelpTooltip>
              「設定 →
              施工パッケージ」で登録済みのメニューを選ぶと、価格・明細を自動で反映します。使わない場合はこのまま次に進んでも構いません。
            </HelpTooltip>
          </div>
          <div className="mt-1 text-xs text-muted">
            選択すると施工内容欄に明細を初期表示します。テンプレ未選択なら推奨レイアウトが自動選択されます。
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost px-3 py-1 text-xs whitespace-nowrap"
          onClick={() => setOpen(true)}
          data-testid="cert-pick-package-trigger"
        >
          {appliedSnapshot ? "別のパッケージを選ぶ" : "+ パッケージから取り込む"}
        </button>
      </div>

      {/* Hidden field stamps the package id into the cert for traceability */}
      {appliedSnapshot && (
        <>
          <input type="hidden" name="package_id" value={appliedSnapshot.package.id} />
          <input
            type="hidden"
            name="package_snapshot_json"
            value={JSON.stringify({
              id: appliedSnapshot.package.id,
              name: appliedSnapshot.package.name,
              category: appliedSnapshot.package.category,
              price: appliedSnapshot.price,
              items_total: appliedSnapshot.items_total,
              items: appliedSnapshot.items.map((it) => ({
                menu_item_id: it.menu_item_id,
                name: it.name,
                quantity: it.quantity,
                unit_price: it.unit_price,
                line_total: it.line_total,
              })),
            })}
          />
        </>
      )}

      {appliedSnapshot && (
        <div
          className="mt-2 rounded-lg border border-success/30 bg-success-dim p-3"
          data-testid="cert-pick-package-applied"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-muted">適用中のパッケージ</div>
              <div className="text-sm font-semibold text-primary">{appliedSnapshot.package.name}</div>
              <div className="mt-0.5 text-[11px] text-secondary">
                {appliedSnapshot.items.length} 品目 / 合計 {formatJpy(appliedSnapshot.items_total)}
                {appliedSnapshot.price != null && appliedSnapshot.price !== appliedSnapshot.items_total
                  ? ` (適用価格 ${formatJpy(appliedSnapshot.price)})`
                  : ""}
              </div>
            </div>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={clearPackage}>
              解除
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="glass-card max-h-[85vh] w-full max-w-2xl overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">施工パッケージ</div>
                <div className="mt-0.5 text-base font-semibold text-primary">パッケージから取り込む</div>
              </div>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>

            {error && <div className="text-sm text-danger">{error}</div>}

            {!pkgList && <div className="text-xs text-muted">読み込み中…</div>}

            {pkgList && (pkgList.packages?.length ?? 0) === 0 && (
              <div className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-sm text-muted">
                利用可能なパッケージがありません。
                <Link href="/admin/service-packages/new" className="ml-1 text-accent hover:underline">
                  新規作成 →
                </Link>
              </div>
            )}

            {pkgList &&
              SERVICE_PACKAGE_CATEGORIES.map((cat) => {
                const rows = grouped.get(cat) ?? [];
                if (rows.length === 0) return null;
                return (
                  <section key={cat} className="space-y-1">
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-muted">
                      {SERVICE_PACKAGE_CATEGORY_LABEL[cat]}
                    </div>
                    <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                      {rows.map((p) => (
                        <li key={p.id} className="flex items-center justify-between p-3">
                          <div>
                            <div className="text-sm font-medium text-primary">{p.name}</div>
                            <div className="text-[11px] text-muted">
                              {p.item_count} 品目
                              {p.price_strategy === "fixed" && p.fixed_price != null
                                ? ` / 固定 ${formatJpy(p.fixed_price)}`
                                : p.price_strategy === "manual"
                                  ? " / 手動"
                                  : " / 明細合計"}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs"
                            disabled={picking === p.id}
                            onClick={() => pickPackage(p.id)}
                            data-testid={`cert-pick-package-${p.id}`}
                          >
                            {picking === p.id ? "取り込み中…" : "選択"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
