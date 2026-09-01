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
                "createPlatformScopedAdmin(reason) for /api/admin platform routes, " +
                "or createServiceRoleAdmin(reason) for cron/webhook contexts.",
            },
          ],
        },
      ],
    },
  },
  {
    // web (src/**) から apps/mobile のソースを import させない。
    //
    // ルートの package.json に workspaces が無く、web の CI は root の npm ci しか
    // 実行しない。一方 apps/mobile/tsconfig.json は expo/tsconfig.base を継承しており、
    // これは apps/mobile/node_modules にしか無い。そのため import した瞬間、手元では
    // 通るのに CI だけが落ちる。
    //
    //   [TSCONFIG_ERROR] Failed to load tsconfig for
    //   'apps/mobile/src/lib/xxx.ts': Tsconfig not found
    //
    // 実際に 2026-09-01 にこれで main の CI が半日赤くなった。
    // モバイルの実装を検査したいなら、モバイル側に *.check.ts を置くか、
    // src/lib/notifications/__tests__/mobileIcons.test.ts のように
    // ソースを**テキストとして読む**（import しない）。
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/apps/mobile/**"],
              message:
                "web から apps/mobile のソースを import すると CI だけが落ちる " +
                "(root の npm ci に expo が入らず tsconfig の継承が解決できない)。" +
                "モバイル側に *.check.ts を置くか、ソースをテキストとして読むこと。",
            },
          ],
        },
      ],
    },
  },
  {
    // Inside /api/admin/** prefer the explicit createPlatformScopedAdmin
    // wrapper over the generic createServiceRoleAdmin. Both compile to the
    // same client, but the platform-specific name documents the upstream
    // requirePlatformAdmin() check and shows up in code review grep.
    files: ["src/app/api/admin/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              importNames: ["getSupabaseAdmin", "createAdminClient", "supabaseAdmin", "createServiceRoleAdmin"],
              message:
                "Inside /api/admin/** use createPlatformScopedAdmin(reason) to make the " +
                "platform-admin contract explicit. createServiceRoleAdmin is reserved for " +
                "cron/webhook contexts.",
            },
          ],
        },
      ],
    },
  },
  {
    // The admin client module itself and its tests are allowed to import the
    // raw symbols — that's where they live.
    //
    // ここで "off" にすると `no-restricted-imports` が**丸ごと**無効になり、
    // apps/mobile の禁止まで消える。実際 main の CI を半日赤くした import は
    // src/lib/ui-preferences/__tests__/ にあり、この免除の内側だった。
    // 免除するのは admin クライアントの paths だけにして、パターンは残す。
    files: ["src/lib/supabase/admin.ts", "src/lib/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/apps/mobile/**"],
              message:
                "web から apps/mobile のソースを import すると CI だけが落ちる " +
                "(root の npm ci に expo が入らず tsconfig の継承が解決できない)。" +
                "モバイル側に *.check.ts を置くか、ソースをテキストとして読むこと。",
            },
          ],
        },
      ],
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
