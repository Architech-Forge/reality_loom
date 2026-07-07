/**
 * Compliance runner (REF-1900.021, COMP-2000).
 *
 * Runs the compliance suites under compliance/suites. The full suite set is
 * specified by Volume 2000 and lands with that implementation phase; suites
 * added there are picked up automatically.
 */
import { execSync } from "node:child_process";

execSync("pnpm exec vitest run compliance/suites --passWithNoTests", {
  stdio: "inherit"
});
