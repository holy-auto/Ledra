"use client";

import type { ReactNode } from "react";
import { usePublishPageBar } from "@/components/ui/PageBar";

export interface PageHeaderTab {
  /** 一意キー。activeTab と照合する。 */
  key: string;
  label: string;
  /** 件数などのバッジ（任意）。 */
  badge?: number;
  /** ルート型タブはこれを渡すと <Link> になる。省略時は onTabSelect のボタン。 */
  href?: string;
}

interface PageHeaderProps {
  /** アイブロウ相当。現在はグローバルバーのパンくずと重複するため非表示（互換のため受け取る）。 */
  tag?: string;
  title: string;
  /** タイトル右に密着させる補助情報（StatusBadge・件数・所属・納期など）。任意。 */
  meta?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** L字シェルのページバーの下線タブ。省略時はタブ無し。 */
  tabs?: PageHeaderTab[];
  /** 現在アクティブなタブの key。 */
  activeTab?: string;
  /** ボタン型タブの選択ハンドラ（href が無いタブで使用）。 */
  onTabSelect?: (key: string) => void;
}

/**
 * L3 ページバーへ内容を publish するだけのコンポーネント（見た目は持たない）。
 * 実際のバーはレイアウト直下の <AdminPageBar>（PageBar.tsx）が全幅サーフェス帯
 * として描画する。呼び出し側の API は従来どおり。
 */
export default function PageHeader({
  title,
  meta,
  description,
  actions,
  tabs,
  activeTab,
  onTabSelect,
}: PageHeaderProps) {
  usePublishPageBar({ title, meta, description, actions, tabs, activeTab, onTabSelect });
  return null;
}
