import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Downgrade to warnings — too many legacy usages to fix at once before launch
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      // React Compiler / react-hooks rules — warn until existing code is refactored
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/config": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/component-hook-factories": "warn",

      // Guard against bypassing RLS without a scoped admin wrapper.
      // `getSupabaseAdmin` / `createAdminClient` / `supabaseAdmin` all return
      // a service-role client that sees every tenant. Callers MUST use one of:
      //   - createTenantScopedAdmin(tenantId)
      //   - createInsurerScopedAdmin(insurerId)
      //   - createServiceRoleAdmin(reason)    // explicit escape hatch with breadcrumb
      //
      // The burndown is complete — this rule is now `error` to prevent
      // regression. The only file allowed to re-export the raw symbols is
      // `src/lib/supabase/admin.ts` itself (see the override below).
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              importNames: ["getSupabaseAdmin", "createAdminClient", "supabaseAdmin"],
              message:
                "Raw admin clients bypass RLS across every tenant. " +
                "Use createTenantScopedAdmin(tenantId), createInsurerScopedAdmin(insurerId), " +
                "or createServiceRoleAdmin(reason) for platform-wide cases.",
            },
          ],
        },
      ],
    },
  },
  {
    // The admin client module itself and its tests are allowed to import the
    // raw symbols — that's where they live.
    files: ["src/lib/supabase/admin.ts", "src/lib/**/__tests__/**"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code worktree files — not part of the main source tree
    ".claude/**",
    // Backup snapshots — not part of the main source tree
    "_backup/**",
  ]),
]);

export default eslintConfig;
