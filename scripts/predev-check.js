const fs = require("fs");

const required = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/c/[public_id]/page.tsx",
  "src/app/admin/certificates/page.tsx",
  "src/app/login/page.tsx",
  "src/middleware.ts",
];

const missing = required.filter((p) => !fs.existsSync(p));

if (missing.length) {
  console.error("\n❌ Missing required files:\n" + missing.map((m) => " - " + m).join("\n"));
  console.error("\nFix: recreate the missing route files before running dev/build.\n");
  process.exit(1);
}

console.log("✅ predev-check OK");
