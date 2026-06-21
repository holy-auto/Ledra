import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function loadShop(slug: string) {
  const supabase = createServiceRoleAdmin("public shop profile — slug lookup, unauthenticated visitor (公開情報のみ)");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, address, contact_phone, contact_email, website_url, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (!tenant) return null;

  const [menu, staff, certs] = await Promise.all([
    supabase
      .from("menu_items")
      .select("id, name, description, unit_price")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(100),
    supabase
      .from("staff_members")
      .select("id, name, kind, skills")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(100),
    supabase
      .from("manufacturer_certified_tenants")
      .select("manufacturer_id, status, manufacturers ( name, is_active )")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .limit(100),
  ]);

  const certifications = (certs.data ?? [])
    .map((row) => {
      const m = (Array.isArray(row.manufacturers) ? row.manufacturers[0] : row.manufacturers) as {
        name: string | null;
        is_active: boolean | null;
      } | null;
      return m?.is_active ? m.name : null;
    })
    .filter((n): n is string => !!n);

  return { tenant, menu: menu.data ?? [], staff: staff.data ?? [], certifications };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) return { title: "店舗が見つかりません | Ledra" };
  return {
    title: `${shop.tenant.name} | 車体整備店舗情報`,
    description: `${shop.tenant.name} の提供サービス・標準料金・認定・整備士資格などの情報。`,
  };
}

export default async function ShopProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const shop = await loadShop(slug);
  if (!shop) notFound();
  const { tenant, menu, staff, certifications } = shop;

  // 整備士資格・スキルタグを職人横断で集約 (重複排除)
  const qualifications = Array.from(new Set(staff.flatMap((s) => (s.skills as string[]) ?? []))).filter(Boolean);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 16px", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ borderBottom: "2px solid #0071e3", paddingBottom: 16, marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>{tenant.name}</h1>
        <div style={{ color: "#666", fontSize: 14, marginTop: 8, lineHeight: 1.7 }}>
          {tenant.address && <div>{tenant.address}</div>}
          {tenant.contact_phone && <div>TEL: {tenant.contact_phone}</div>}
          {tenant.website_url && (
            <div>
              <a href={tenant.website_url} rel="noreferrer noopener" target="_blank" style={{ color: "#0071e3" }}>
                {tenant.website_url}
              </a>
            </div>
          )}
        </div>
      </header>

      {/* 認定・優良認定 */}
      {certifications.length > 0 && (
        <Section title="認定・資格">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {certifications.map((c) => (
              <span key={c} style={badge("#0071e3")}>
                {c} 認定施工店
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 整備士資格・スキル */}
      {qualifications.length > 0 && (
        <Section title="整備士資格・専門スキル">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {qualifications.map((q) => (
              <span key={q} style={badge("#34a853")}>
                {q}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 提供サービス・標準料金 */}
      <Section title="提供サービス・標準料金">
        {menu.length === 0 ? (
          <p style={{ color: "#888", fontSize: 14 }}>掲載中のサービスはありません。</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <tbody>
              {menu.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px 0" }}>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    {m.description && <div style={{ color: "#888", fontSize: 12 }}>{m.description}</div>}
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", whiteSpace: "nowrap", color: "#111" }}>
                    {m.unit_price > 0 ? `¥${Number(m.unit_price).toLocaleString("ja-JP")}〜` : "応相談"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ color: "#999", fontSize: 12, marginTop: 8 }}>
          ※ 標準料金は目安です。車種・損傷状況により変動します。正式金額は見積りをご確認ください。
        </p>
      </Section>

      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #eee", color: "#aaa", fontSize: 12 }}>
        この情報は車体整備の透明性確保に向け公開されています (国土交通省ガイドライン4.3)。Powered by Ledra
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{title}</h2>
      {children}
    </section>
  );
}

function badge(color: string): React.CSSProperties {
  return {
    background: `${color}15`,
    color,
    border: `1px solid ${color}40`,
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 600,
  };
}
