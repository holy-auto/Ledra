// @contentauth/c2pa-node is an optionalDependency: its postinstall builds a
// native binary and is allowed to fail (e.g. no prebuilt binary for the
// platform), in which case the package — and its bundled type declarations —
// are absent. This shorthand ambient declaration lets `tsc --noEmit` and
// `next build` still resolve the dynamic imports in src/lib/anchoring/providers/
// (typed as `any`) instead of failing with TS2307. When the package IS
// installed its real type declarations take precedence over this shim.
// ponytail: in the failed-install case c2pa usages fall back to `any`; the
// runtime already degrades to DISABLED_RESULT via dynamic import + try/catch.
declare module "@contentauth/c2pa-node";
