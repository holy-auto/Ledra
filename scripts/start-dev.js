// Workaround for Windows junction path doubling with Turbopack.
// Forces CWD to the D: realpath before Next.js initializes,
// so that resolve(".") and process.cwd() are consistent.
process.chdir("D:\\holy-cert\\.claude\\worktrees\\unruffled-lovelace");
require("D:\\holy-cert\\node_modules\\next\\dist\\bin\\next");
