"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import FirstUseInlineGuide from "@/components/ui/FirstUseInlineGuide";

type Product = {
  id: string;
  name: string;
  product_code: string | null;
  description: string | null;
  tenant_id: string | null;
};

type Brand = {
  id: string;
  name: string;
  description: string | null;
  website_url: string | null;
  tenant_id: string | null;
  coating_products: Product[];
};

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

export default function BrandsClient({ initialBrands }: { initialBrands: Brand[] }) {
  const [brands, setBrands] = useState<Brand[]>(initialBrands);

  // New brand form
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandDesc, setNewBrandDesc] = useState("");
  const [newBrandUrl, setNewBrandUrl] = useState("");
  const [addingBrand, setAddingBrand] = useState(false);
  const [brandErr, setBrandErr] = useState<string | null>(null);

  // Expanded brand
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Per-brand new product form
  const [addingProductFor, setAddingProductFor] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [newProductDesc, setNewProductDesc] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [productErr, setProductErr] = useState<string | null>(null);

  async function addBrand(e: React.FormEvent) {
    e.preventDefault();
    setAddingBrand(true);
    setBrandErr(null);
    try {
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newBrandName,
          description: newBrandDesc || null,
          website_url: newBrandUrl || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setBrandErr(j.message || "登録に失敗しました。");
        return;
      }
      setBrands((prev) => [...prev, { ...j.brand, coating_products: [] }]);
      setNewBrandName("");
      setNewBrandDesc("");
      setNewBrandUrl("");
      setShowNewBrand(false);
    } catch {
      setBrandErr("登録に失敗しました。");
    } finally {
      setAddingBrand(false);
    }
  }

  async function deleteBrand(id: string) {
    if (!confirm("このブランドを削除しますか？")) return;
    const res = await fetch("/api/admin/brands", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const j = await res.json();
    if (!res.ok) {
      alert(j.message || "削除できませんでした。");
      return;
    }
    setBrands((prev) => prev.filter((b) => b.id !== id));
  }

  async function addProduct(brandId: string, e: React.FormEvent) {
    e.preventDefault();
    setSavingProduct(true);
    setProductErr(null);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProductName,
          product_code: newProductCode || null,
          description: newProductDesc || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setProductErr(j.message || "登録に失敗しました。");
        return;
      }
      setBrands((prev) =>
        prev.map((b) => (b.id === brandId ? { ...b, coating_products: [...b.coating_products, j.product] } : b)),
      );
      setNewProductName("");
      setNewProductCode("");
      setNewProductDesc("");
      setAddingProductFor(null);
    } catch {
      setProductErr("登録に失敗しました。");
    } finally {
      setSavingProduct(false);
    }
  }

  async function deleteProduct(brandId: string, productId: string) {
    if (!confirm("この製品を削除しますか？")) return;
    const res = await fetch(`/api/admin/brands/${brandId}/products`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: productId }),
    });
    if (!res.ok) {
      alert("削除できませんでした。");
      return;
    }
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId ? { ...b, coating_products: b.coating_products.filter((p) => p.id !== productId) } : b,
      ),
    );
  }

  const brandForm = (
    <form onSubmit={addBrand} className="glass-card p-5 space-y-4">
      <div className="text-sm font-semibold text-primary">新しいブランドを追加</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={newBrandName}
          onChange={(e) => setNewBrandName(e.target.value)}
          placeholder="ブランド名 *"
          required
          className={`${inputCls} sm:col-span-2`}
        />
        <input
          value={newBrandUrl}
          onChange={(e) => setNewBrandUrl(e.target.value)}
          placeholder="Webサイト URL（任意）"
          className={inputCls}
        />
        <input
          value={newBrandDesc}
          onChange={(e) => setNewBrandDesc(e.target.value)}
          placeholder="説明（任意）"
          className={inputCls}
        />
      </div>
      {brandErr && <p className="text-sm text-red-500">{brandErr}</p>}
      <div className="flex gap-3">
        <Button type="submit" loading={addingBrand}>
          追加する
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setShowNewBrand(false);
            setBrandErr(null);
          }}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-4">
      <FirstUseInlineGuide
        storageKey="settings_brands"
        title="コーティング剤マスターとは"
        description="証明書発行画面で選択肢に出てくるコーティング剤・PPFフィルムの一覧です。ブランド配下に製品を登録する2階層構造になっています。"
        steps={[
          {
            title: "ブランドを追加",
            description: "「+ ブランドを追加」から CARPRO / GYEON / GLARE などのメーカー名を登録します。",
          },
          {
            title: "ブランドを開いて製品を追加",
            description: "ブランドカードを展開し「+ 製品を追加」で製品名 (例: CQuartz UK 3.0) と製品コードを登録。",
          },
          {
            title: "証明書発行で自動表示",
            description: "コーティング・PPFテンプレートでの証明書発行時、登録済み製品が選択肢に表示されます。",
          },
        ]}
      />

      {/* Top toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted">{brands.length} ブランド登録済み</div>
        {!showNewBrand && (
          <Button size="sm" onClick={() => setShowNewBrand(true)}>
            ＋ ブランドを追加
          </Button>
        )}
      </div>

      {/* Add brand form (shown at top when open) */}
      {showNewBrand && brandForm}

      {/* Brand list */}
      {brands.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-muted">
            ブランドが登録されていません。下の「+ ブランドを追加」から登録を始めましょう。
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {brands.map((brand) => {
            const isOwn = !!brand.tenant_id;
            const isExpanded = expandedId === brand.id;
            return (
              <div key={brand.id} className="glass-card overflow-hidden">
                <div className="flex items-center gap-4 p-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary">{brand.name}</span>
                      {!isOwn && (
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">共通</span>
                      )}
                    </div>
                    {brand.description && <div className="text-xs text-muted mt-0.5">{brand.description}</div>}
                    <div className="text-xs text-muted mt-0.5">{brand.coating_products.length} 製品</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : brand.id)}
                      className="btn-ghost !px-3 !py-1.5 !text-xs"
                    >
                      {isExpanded ? "閉じる" : "製品を見る"}
                    </button>
                    {isOwn && (
                      <button
                        type="button"
                        onClick={() => deleteBrand(brand.id)}
                        className="btn-ghost !px-3 !py-1.5 !text-xs text-red-500 hover:text-red-600"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border-subtle px-5 pb-5 pt-4 space-y-3">
                    {brand.coating_products.length === 0 ? (
                      <p className="text-xs text-muted">製品がまだ登録されていません。</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-border-subtle">
                              <th className="py-2 text-left text-xs text-muted font-semibold">製品名</th>
                              <th className="py-2 text-left text-xs text-muted font-semibold">品番</th>
                              <th className="py-2 text-left text-xs text-muted font-semibold"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle">
                            {brand.coating_products.map((p) => (
                              <tr key={p.id}>
                                <td className="py-2 font-medium text-primary">{p.name}</td>
                                <td className="py-2 font-mono text-secondary text-xs">{p.product_code ?? "-"}</td>
                                <td className="py-2">
                                  {p.tenant_id && (
                                    <button
                                      type="button"
                                      onClick={() => deleteProduct(brand.id, p.id)}
                                      className="text-xs text-red-500 hover:text-red-600"
                                    >
                                      削除
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Add product form */}
                    {addingProductFor === brand.id ? (
                      <form
                        onSubmit={(e) => addProduct(brand.id, e)}
                        className="rounded-xl border border-border-default bg-inset p-4 space-y-3 mt-3"
                      >
                        <div className="text-xs font-semibold text-primary">製品を追加</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            value={newProductName}
                            onChange={(e) => setNewProductName(e.target.value)}
                            placeholder="製品名 *"
                            required
                            className={inputCls}
                          />
                          <input
                            value={newProductCode}
                            onChange={(e) => setNewProductCode(e.target.value)}
                            placeholder="品番（任意）"
                            className={inputCls}
                          />
                          <input
                            value={newProductDesc}
                            onChange={(e) => setNewProductDesc(e.target.value)}
                            placeholder="説明（任意）"
                            className={`${inputCls} sm:col-span-2`}
                          />
                        </div>
                        {productErr && <p className="text-xs text-red-500">{productErr}</p>}
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" loading={savingProduct}>
                            追加する
                          </Button>
                          <button
                            type="button"
                            onClick={() => setAddingProductFor(null)}
                            className="rounded-lg border border-border-default bg-surface px-3 py-1.5 text-xs text-secondary hover:bg-surface-hover"
                          >
                            キャンセル
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingProductFor(brand.id);
                          setProductErr(null);
                        }}
                        className="rounded-lg border border-dashed border-border-default px-4 py-2 text-xs text-muted hover:border-border-strong hover:text-primary"
                      >
                        ＋ 製品を追加
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add brand (bottom) */}
      {!showNewBrand && (
        <button
          type="button"
          onClick={() => setShowNewBrand(true)}
          className="rounded-xl border border-dashed border-border-default w-full py-3 text-sm text-muted hover:border-border-strong hover:text-primary"
        >
          ＋ ブランドを追加
        </button>
      )}
    </div>
  );
}
