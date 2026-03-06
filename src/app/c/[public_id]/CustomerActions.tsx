"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  publicId?: string;
  pdfHref?: string;
  returnTo?: string;
  logoutHref?: string; // 明示指定があれば最優先
  tenant?: string;     // 明示指定があれば補助に使う
};

function tryDecode(v: string): string {
  try { return decodeURIComponent(v); } catch { return v; }
}

function safeReturnTo(raw: string | null | undefined): string {
  if (!raw) return "";
  const decoded = tryDecode(String(raw)).trim();
  if (!decoded) return "";

  // absolute URL -> same-site path
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    try {
      const u = new URL(decoded);
      return (u.pathname + u.search + u.hash) || "";
    } catch {
      return "";
    }
  }

  if (decoded.startsWith("/")) return decoded;
  return "";
}

function extractTenantFromCustomerPath(path: string): string {
  const m = path.match(/^\/customer\/([^\/\?#]+)/);
  return m?.[1] ?? "";
}

function extractPublicIdFromPathname(pathname: string): string {
  const m = pathname.match(/^\/c\/([^\/\?#]+)/);
  return m?.[1] ?? "";
}

export default function CustomerActions(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ✅ 初回は props のみ（SSRと一致させる）
  const initial = useMemo(() => {
    const pid = (props.publicId ?? "").trim();
    const rt = safeReturnTo(props.returnTo);
    const tenantFromRt = rt ? extractTenantFromCustomerPath(rt) : "";
    const tenant = (props.tenant ?? "").trim() || tenantFromRt;

    const pdfHref =
      (props.pdfHref ?? "").trim() ||
      (pid ? `/api/certificate/pdf?pid=${encodeURIComponent(pid)}` : "");

    const listUrl =
      rt && rt.startsWith("/customer/") ? rt :
      tenant ? `/customer/${encodeURIComponent(tenant)}` : "";

    const loginUrl =
      tenant ? `/customer/${encodeURIComponent(tenant)}/login` : "/";

    const logoutAfter =
      (props.logoutHref ?? "").trim() || loginUrl;

    // 初回は “customer導線らしい” と判断できれば表示（query logout=1 はマウント後）
    const showLogout = !!tenant || (!!rt && rt.startsWith("/customer/"));

    return { pid, rt, tenant, pdfHref, listUrl, logoutAfter, showLogout, pdfBlocked: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [s, setS] = useState(initial);

  // ✅ マウント後に query/path から補完（tenant優先→rt→推定）
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);

      const rt_q = safeReturnTo(sp.get("rt"));
      const tenant_q = (sp.get("tenant") ?? "").trim();
      const logout_q = sp.get("logout") === "1";

      const pid_path = extractPublicIdFromPathname(window.location.pathname);

      const rt = rt_q || s.rt || "";
      const tenant =
        tenant_q ||
        s.tenant ||
        (rt ? extractTenantFromCustomerPath(rt) : "") ||
        "";

      const pid = s.pid || pid_path;

      const pdfHref =
        s.pdfHref ||
        (pid ? `/api/certificate/pdf?pid=${encodeURIComponent(pid)}` : "");

      const listUrl =
        (rt && rt.startsWith("/customer/")) ? rt :
        tenant ? `/customer/${encodeURIComponent(tenant)}` : "";

      const loginUrl =
        tenant ? `/customer/${encodeURIComponent(tenant)}/login` : "/";

      const logoutAfter =
        (props.logoutHref ?? "").trim() || s.logoutAfter || loginUrl;

      const showLogout = logout_q || !!tenant || !!listUrl;

      const notice = (sp.get("notice") ?? "").trim();
      const pdfBlocked =
        notice === "pdf_blocked" ||
        notice === "pdf_blocked_grace_expired" ||
        notice === "pdf_blocked_inactive" ||
        notice === "payment_required";setS({ pid, rt, tenant, pdfHref, listUrl, logoutAfter, showLogout, pdfBlocked });
    } catch {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPdf = !!s.pdfHref && !s.pdfBlocked;
  const canList = !!s.listUrl;
  const canLogout = s.showLogout && !!s.logoutAfter;

  const onPdf = () => {
    if (!s.pdfHref || s.pdfBlocked) return;
    window.open(s.pdfHref, "_blank", "noopener,noreferrer");
  };

  const onBack = () => {
    if (s.rt) router.push(s.rt);
    else router.back();
  };

  const onList = () => {
    if (s.listUrl) router.push(s.listUrl);
  };

  const onLogout = () => {
    startTransition(async () => {
      try {
        await fetch("/api/customer/logout", { method: "POST", credentials: "include" });
      } catch {
        // ignore
      } finally {
        router.replace(s.logoutAfter || "/");
        router.refresh();
      }
    });
  };

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onPdf}
        disabled={!canPdf}
        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {s.pdfBlocked ? "PDF（停止中）" : "PDF生成"}
      </button>

      <button
        type="button"
        onClick={onBack}
        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
      >
        戻る
      </button>

      <button
        type="button"
        onClick={onList}
        disabled={!canList}
        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        車両一覧に戻る
      </button>

      <button
        type="button"
        onClick={onLogout}
        disabled={!canLogout || pending}
        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        ログアウト
      </button>
    </div>
  );
}