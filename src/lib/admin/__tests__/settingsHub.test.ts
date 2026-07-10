import { describe, it, expect } from "vitest";
import { groupHubEntries, isHubEntryVisible, type HubEntry, type HubGate } from "@/lib/admin/settingsHub";

/** 全権のテナント管理者ゲート（ロード完了・role あり）。 */
const ownerGate: HubGate = {
  role: "owner",
  isPlatformAdmin: false,
  isOrgUser: false,
  loading: false,
  can: () => true,
};

const entries: HubEntry[] = [
  { href: "/admin/settings", label: "店舗設定", hubSection: "店舗・組織", requiredPermission: "settings:view" },
  { href: "/admin/stores", label: "店舗管理", hubSection: "店舗・組織", requiredPermission: "stores:view" },
  { href: "/admin/billing", label: "請求・プラン", hubSection: "連携・課金", requiredPermission: "billing:view" },
  { href: "/admin/audit", label: "操作履歴", hubSection: "監査・その他", requiredPermission: "audit:view" },
  { href: "/admin/platform/ops", label: "運営", hubSection: "運営", platformOnly: true },
];

describe("isHubEntryVisible", () => {
  it("運営(platformOnly)は運営管理者のみ可視", () => {
    const platform: HubEntry = { href: "/x", label: "x", platformOnly: true };
    expect(isHubEntryVisible(platform, ownerGate)).toBe(false);
    expect(isHubEntryVisible(platform, { ...ownerGate, isPlatformAdmin: true })).toBe(true);
  });

  it("本社専用ユーザ(role無し)は orgUserVisible 項目のみ", () => {
    const orgGate: HubGate = { ...ownerGate, isOrgUser: true, role: null };
    const orgItem: HubEntry = { href: "/hq", label: "本社", orgUserVisible: true };
    const shopItem: HubEntry = { href: "/s", label: "店舗", requiredPermission: "settings:view" };
    expect(isHubEntryVisible(orgItem, orgGate)).toBe(true);
    expect(isHubEntryVisible(shopItem, orgGate)).toBe(false);
  });

  it("権限が無ければ弾く（role 確定後のみ）", () => {
    const noBilling: HubGate = { ...ownerGate, can: (p) => p !== "billing:view" };
    const billing: HubEntry = { href: "/admin/billing", label: "請求", requiredPermission: "billing:view" };
    expect(isHubEntryVisible(billing, noBilling)).toBe(false);
    // ロード中は楽観表示（弾かない）
    expect(isHubEntryVisible(billing, { ...noBilling, loading: true })).toBe(true);
  });
});

describe("groupHubEntries", () => {
  it("excludeHref（ハブ自身）はカードにしない", () => {
    const sections = groupHubEntries(entries, ownerGate, "/admin/settings");
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).not.toContain("/admin/settings");
    expect(hrefs).toContain("/admin/stores");
  });

  it("HUB_SECTION_ORDER の順で見出しを返す", () => {
    const sections = groupHubEntries(entries, { ...ownerGate, isPlatformAdmin: true }, "/admin/settings");
    expect(sections.map((s) => s.section)).toEqual(["店舗・組織", "連携・課金", "監査・その他", "運営"]);
  });

  it("運営項目は非運営ユーザには出ない", () => {
    const sections = groupHubEntries(entries, ownerGate);
    expect(sections.map((s) => s.section)).not.toContain("運営");
  });
});
