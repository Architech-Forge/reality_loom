import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against package sources so a full build is not required first.
    alias: {
      "@roc/types": p("./packages/roc/types/src/index.ts"),
      "@roc/diagnostics": p("./packages/roc/diagnostics/src/index.ts"),
      "@wge/wil": p("./packages/wge/wil/src/index.ts"),
      "@wge/kernel": p("./packages/wge/kernel/src/index.ts"),
      "@wge/graph": p("./packages/wge/graph/src/index.ts"),
      "@wge/wdl": p("./packages/wge/wdl/src/index.ts"),
      "@wge/executable": p("./packages/wge/executable/src/index.ts"),
      "@wge/compiler": p("./packages/wge/compiler/src/index.ts"),
      "@wge/physics": p("./packages/wge/physics/src/index.ts"),
      "@wge/runtime": p("./packages/wge/runtime/src/index.ts"),
      "@sli/renderer-contract": p("./packages/sli/renderer-contract/src/index.ts"),
      "@sli/design-system": p("./packages/sli/design-system/src/index.ts"),
      "@sli/runtime": p("./packages/sli/runtime/src/index.ts"),
      "@roc/testing": p("./packages/roc/testing/src/index.ts"),
      "@roc/compliance": p("./packages/roc/compliance/src/index.ts"),
      "@roc/app-integration": p("./packages/roc/app-integration/src/index.ts"),
      "@roc/storage": p("./packages/roc/storage/src/index.ts"),
      "@roc/security": p("./packages/roc/security/src/index.ts"),
      "@roc/sdk": p("./packages/sdk/src/index.ts"),
      "@examples/family-style-world": p("./examples/family-style-world/src/index.ts"),
      "@apps/reference-demo": p("./apps/reference-demo/src/index.ts")
    }
  },
  test: {
    include: [
      "packages/**/tests/**/*.test.ts",
      "compliance/suites/**/*.test.ts",
      "e2e/**/*.test.ts"
    ]
  }
});
