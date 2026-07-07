/**
 * Reference Implementation build script.
 *
 * REF-1900.003 — Package Build Order.
 * Packages MUST build in dependency order so lower-level packages never
 * depend on higher-level packages. Later milestones append to this list;
 * the order below is normative and mirrors the Codex.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const BUILD_ORDER: string[] = [
  "packages/roc/types", // 1.  @roc/types
  "packages/roc/diagnostics", // 2.  @roc/diagnostics
  "packages/wge/wil", // 3.  @wge/wil
  "packages/wge/kernel", // 4.  @wge/kernel
  "packages/wge/graph", // 5.  @wge/graph        (Milestone 2)
  "packages/wge/wdl", // 6.  @wge/wdl          (Milestone 2)
  // REF-1900.003 lists compiler (7) before executable (8), but REF-1900.009
  // requires compileWorld to return an Executable World, so the executable
  // package is a compiler dependency and builds first (approved in-session).
  "packages/wge/executable", // 8.  @wge/executable   (Milestone 2)
  "packages/wge/compiler", // 7.  @wge/compiler     (Milestone 2)
  "packages/wge/physics", // 9.  @wge/physics      (Milestone 4)
  "packages/wge/runtime", // 10. @wge/runtime      (Milestone 3)
  "packages/sli/renderer-contract", // 11. @sli/renderer-contract (Milestone 5)
  "packages/sli/design-system", // 12. @sli/design-system (Milestone 5)
  "packages/sli/runtime", // 13. @sli/runtime      (Milestone 5)
  "packages/roc/testing", // 14. @roc/testing      (Milestone 6)
  "packages/roc/compliance", // 15. @roc/compliance   (Vol 2000)
  "packages/sdk", // 16. @roc/sdk          (Milestone 6)
  "packages/roc/app-integration", // Vol 1700 — Application Integration
  "packages/roc/storage", // Vol 2200 — Storage And Persistence
  "packages/roc/security", // Vol 2300 — Security And Permissions
  "examples/family-style-world", // 17. Reference applications
  "apps/reference-demo" // 17. Reference applications
];

let built = 0;
for (const pkg of BUILD_ORDER) {
  if (!existsSync(pkg)) continue; // package arrives in a later milestone
  console.log(`[build] ${pkg}`);
  execSync(`pnpm exec tsc -b ${pkg}`, { stdio: "inherit" });
  built += 1;
}
console.log(`[build] complete — ${built} package(s) built in Codex order.`);
