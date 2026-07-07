/**
 * End-to-end demo entry point (REF-1900.019, REF-1900.023).
 *
 * pnpm demo — runs the First End-To-End Demo and exits non-zero unless every
 * success criterion holds.
 */
import { runDemo } from "../apps/reference-demo/src/index.js";

const result = await runDemo();
process.exit(result.success ? 0 : 1);
