import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

// Workspace packages resolve to their sources (same map the repo's vitest
// config uses) so the studio runs the real stack live, with HMR, no dist
// build required first.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@roc/types": p("../../packages/roc/types/src/index.ts"),
      "@roc/diagnostics": p("../../packages/roc/diagnostics/src/index.ts"),
      "@wge/wil": p("../../packages/wge/wil/src/index.ts"),
      "@wge/kernel": p("../../packages/wge/kernel/src/index.ts"),
      "@wge/graph": p("../../packages/wge/graph/src/index.ts"),
      "@wge/wdl": p("../../packages/wge/wdl/src/index.ts"),
      "@wge/executable": p("../../packages/wge/executable/src/index.ts"),
      "@wge/compiler": p("../../packages/wge/compiler/src/index.ts"),
      "@wge/physics": p("../../packages/wge/physics/src/index.ts"),
      "@wge/runtime": p("../../packages/wge/runtime/src/index.ts"),
      "@sli/renderer-contract": p("../../packages/sli/renderer-contract/src/index.ts"),
      "@sli/design-system": p("../../packages/sli/design-system/src/index.ts"),
      "@sli/runtime": p("../../packages/sli/runtime/src/index.ts"),
      "@sli/renderer-react": p("../../packages/sli/renderer-react/src/index.ts"),
      "@roc/devtools": p("../../packages/roc/devtools/src/index.ts"),
      "@roc/sdk": p("../../packages/sdk/src/index.ts"),
      "@examples/family-style-world": p("../../examples/family-style-world/src/index.ts")
    }
  },
  build: {
    outDir: "build",
    target: "es2022"
  },
  server: {
    port: 5183
  }
});
