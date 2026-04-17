"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PageHeader from "@/components/ui/PageHeader";
import {
  type ShopProductRow,
  type ShopProductCategory,
  type CartItem,
  SHOP_CATEGORY_LABELS,
  SHOP_CATEGORY_ALL,
  calcCartTotals,
} from "@/types/shopProduct";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number) =>
  `¥${n.toLocaleString("ja-JP")}`;

const CATEGORY_ICONS: Record<ShopProductCategory, string> = {
  nfc_tag: "📡",
  certificate_template: "📜",
  sticker: "🏷️",
  sign: "🪧",
  banner: "🚩",
  other: "📦",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ShopPage() {
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<ShopProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cart state
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [showCart, setShowCart] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ShopProductCategory | "all">("all");

  // Checkout state
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "invoice">("stripe");

  // Status from URL (after Stripe redirect)
  const [status, setStatus] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      setStatus(qs.get("status"));
      setOrderNumber(qs.get("order"));
    } catch {}
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shop/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setProducts(j.products ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  /* ── Cart actions ── */
  const addToCart = useCallback((product: ShopProductRow, qty = 1) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      if (existing) {
        next.set(product.id, { ...existing, quantity: existing.quantity + qty });
      } else {
        next.set(product.id, { product, quantity: qty });
      }
      return next;
    });
    setShowCart(true);
  }, []);

  const updateCartQty = useCallback((productId: string, qty: number) => {
    setCart((prev) => {
      const next = new Map(prev);
      if (qty <= 0) {
        next.delete(productId);
      } else {
        const item = next.get(productId);
        if (item) next.set(productId, { ...item, quantity: qty });
      }
      return next;
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });
  }, []);

  const cartItems = useMemo(() => Array.from(cart.values()), [cart]);
  const cartTotals = useMemo(() => calcCartTotals(cartItems), [cartItems]);
  const cartCount = useMemo(
    () => cartItems.reduce((sum, i) => sum + i.quantity, 0),
    [cartItems]
  );

  /* ── Filtered products ── */
  const filteredProducts = useMemo(() => {
    if (activeCategory === "all") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  // Available categories (only those with products)
  const availableCategories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return SHOP_CATEGORY_ALL.filter((c) => cats.has(c));
  }, [products]);

  /* ── Checkout ── */
  const handleCheckout = useCallback(async () => {
    if (cartItems.length === 0) return;
    setCheckoutBusy(true);
    setCheckoutError(null);

    const items = cartItems.map((i) => ({
      product_id: i.product.id,
      quantity: i.quantity,
    }));

    try {
      if (paymentMethod === "stripe") {
        const res = await fetch("/api/admin/shop/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
        if (!j?.url) throw new Error("Checkout URL missing");
        window.location.href = j.url;
      } else {
        // 請求書払い
        const res = await fetch("/api/admin/shop/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ items, payment_method: "invoice" }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
        setCart(new Map());
        setShowCart(false);
        setStatus("invoice_sent");
        setOrderNumber(j.order_number);
      }
    } catch (e: any) {
      setCheckoutError(e?.message ?? String(e));
    } finally {
      setCheckoutBusy(false);
    }
  }, [cartItems, paymentMethod]);

  /* ─��� Render ── */
  return (
    <div className="space-y-6">
      <PageHeader
        tag="Shop"
        title="ショップ"
        description="NFCタグ・ブランド証明書・グッズの購入"
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/admin/shop/orders"
              className="text-sm text-link hover:underline"
            >
              注文履歴
            </Link>
            <button
              onClick={() => setShowCart(!showCart)}
              className="relative inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted transition-colors"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
              </svg>
              カート
              {cartCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        }
      />

      {/* Status banners */}
      {status === "success" && (
        <div className="rounded-lg border border-success/30 bg-success-dim p-4 text-sm text-success-text">
          お支払いが完了しました{orderNumber ? `（注文番号: ${orderNumber}）` : ""}。ご注文ありがとうございます。
        </div>
      )}
      {status === "cancel" && (
        <div className="rounded-lg border border-warning/30 bg-warning-dim p-4 text-sm text-warning-text">
          お支払いがキャンセルされました。
        </div>
      )}
      {status === "invoice_sent" && (
        <div className="rounded-lg border border-accent/30 bg-accent-dim p-4 text-sm text-accent-text">
          ご注文を受け付けました{orderNumber ? `（注文番号: ${orderNumber}）` : ""}。請求書を送付いたしますのでお支払いをお待ちください。
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("all")}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            activeCategory === "all"
              ? "bg-primary text-on-primary"
              : "bg-muted text-secondary hover:bg-muted/80"
          }`}
        >
          すべて
        </button>
        {availableCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              activeCategory === cat
                ? "bg-primary text-on-primary"
                : "bg-muted text-secondary hover:bg-muted/80"
            }`}
          >
            {SHOP_CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Product grid + Cart sidebar */}
      <div className="flex gap-6">
        {/* Products */}
        <div className="flex-1">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="animate-pulse rounded-xl border border-primary/10 bg-surface p-5 space-y-3">
                  <div className="h-4 w-24 rounded bg-muted" />
                  <div className="h-6 w-40 rounded bg-muted" />
                  <div className="h-3 w-full rounded bg-muted" />
                  <div className="h-8 w-20 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-12 text-secondary">商品がありません</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  inCart={cart.has(product.id)}
                  onAdd={() => addToCart(product)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Cart sidebar */}
        {showCart && (
          <div className="w-80 shrink-0 hidden lg:block">
            <div className="sticky top-4 rounded-xl border border-primary/10 bg-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-primary">カート</h3>
                <button
                  onClick={() => setShowCart(false)}
                  className="text-secondary hover:text-primary text-sm"
                >
                  閉じる
                </button>
              </div>

              {cartItems.length === 0 ? (
                <p className="text-sm text-secondary py-4 text-center">
                  カートは空です
                </p>
              ) : (
                <>
                  <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                    {cartItems.map((item) => (
                      <div key={item.product.id} className="flex items-start gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-primary truncate">{item.product.name}</p>
                          <p className="text-secondary">{fmt(item.product.price)} / {item.product.unit}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                            className="h-6 w-6 rounded border border-primary/20 text-xs hover:bg-muted"
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-xs font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                            className="h-6 w-6 rounded border border-primary/20 text-xs hover:bg-muted"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.product.id)}
                            className="ml-1 text-red-500 hover:text-red-700 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-primary/10 pt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-secondary">
                      <span>小計</span>
                      <span>{fmt(cartTotals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-secondary">
                      <span>消費税</span>
                      <span>{fmt(cartTotals.tax)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-primary text-base pt-1">
                      <span>合計</span>
                      <span>{fmt(cartTotals.total)}</span>
                    </div>
                  </div>

                  {/* Payment method selection */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold tracking-wider text-secondary uppercase">お支払い方法</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setPaymentMethod("stripe")}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          paymentMethod === "stripe"
                            ? "border-accent bg-accent-dim text-accent-text"
                            : "border-primary/20 text-secondary hover:bg-muted"
                        }`}
                      >
                        カード決済
                      </button>
                      <button
                        onClick={() => setPaymentMethod("invoice")}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          paymentMethod === "invoice"
                            ? "border-accent bg-accent-dim text-accent-text"
                            : "border-primary/20 text-secondary hover:bg-muted"
                        }`}
                      >
                        請求書払い
                      </button>
                    </div>
                  </div>

                  {checkoutError && (
                    <p className="text-xs text-red-500">{checkoutError}</p>
                  )}

                  <button
                    onClick={handleCheckout}
                    disabled={checkoutBusy || cartItems.length === 0}
                    className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {checkoutBusy
                      ? "処理中..."
                      : paymentMethod === "stripe"
                        ? `${fmt(cartTotals.total)} を支払う`
                        : "請求書払いで注文する"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile cart sheet */}
      {showCart && cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-primary/10 bg-surface p-4 shadow-xl">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <span className="text-secondary">{cartCount}点</span>{" "}
              <span className="font-semibold text-primary">{fmt(cartTotals.total)}</span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutBusy}
              className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
            >
              {checkoutBusy ? "処理中..." : "購入手続きへ"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product Card                                                       */
/* ------------------------------------------------------------------ */

function ProductCard({
  product,
  inCart,
  onAdd,
}: {
  product: ShopProductRow;
  inCart: boolean;
  onAdd: () => void;
}) {
  const meta = product.meta as Record<string, unknown>;
  const isSubscription = (meta?.billing as string) === "monthly";
  const setupFee = meta?.setup_fee as number | undefined;

  return (
    <div className="group rounded-xl border border-primary/10 bg-surface p-5 hover:border-primary/25 transition-colors flex flex-col">
      {/* Category badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-secondary">
          {SHOP_CATEGORY_LABELS[product.category]}
        </span>
      </div>

      {/* Name & description */}
      <h3 className="text-base font-semibold text-primary mb-1">{product.name}</h3>
      {product.description && (
        <p className="text-xs text-secondary leading-relaxed mb-3 line-clamp-2">
          {product.description}
        </p>
      )}

      <div className="mt-auto pt-3 space-y-3">
        {/* Price */}
        <div>
          <span className="text-lg font-bold text-primary">
            {`¥${product.price.toLocaleString("ja-JP")}`}
          </span>
          <span className="text-xs text-secondary ml-1">
            /{product.unit}（税抜）
          </span>
          {isSubscription && setupFee && (
            <p className="text-xs text-secondary mt-0.5">
              + 初期費用 ¥{setupFee.toLocaleString("ja-JP")}
            </p>
          )}
        </div>

        {/* Add to cart */}
        {product.category === "certificate_template" ? (
          <Link
            href="/admin/template-options"
            className="block w-full text-center rounded-lg border border-accent px-3 py-2 text-sm font-medium text-accent hover:bg-accent-dim transition-colors"
          >
            詳細・申し込み
          </Link>
        ) : (
          <button
            onClick={onAdd}
            className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              inCart
                ? "bg-success-dim text-success-text border border-success/30"
                : "bg-accent text-white hover:bg-accent/90"
            }`}
          >
            {inCart ? "カートに追加済み +" : "カートに追加"}
          </button>
        )}
      </div>
    </div>
  );
}
