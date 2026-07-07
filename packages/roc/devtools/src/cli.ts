/**
 * ROC CLI (TOOL-2100.018): scriptable, deterministic, and safe.
 *
 * Commands wrap existing platform capabilities — the CLI never mutates
 * Reality outside WIL and returns proper exit codes with optional
 * machine-readable JSON.
 */
import { readFileSync } from "node:fs";
import { parseWDLDocument } from "@wge/wdl";
import { compileWorld } from "@wge/compiler";

export interface CliResult {
  code: number;
  output: string[];
  json?: Record<string, unknown>;
}

const USAGE = [
  "roc — Reality-Oriented Computing CLI",
  "",
  "  roc validate <world.wdl.json> [--json]   validate a structured WDL document",
  "  roc compile  <world.wdl.json> [--json]   compile a World and report diagnostics",
  "  roc help                                 show this message",
  "",
  "  Runtime, projection, compliance, and demo workflows run through the",
  "  package scripts: pnpm demo, pnpm compliance, pnpm test."
];

export async function runCli(argv: string[]): Promise<CliResult> {
  const [command, ...rest] = argv;
  const json = rest.includes("--json");
  const args = rest.filter((a) => a !== "--json");

  switch (command) {
    case "validate": {
      const file = args[0];
      if (!file) return { code: 2, output: ["error: roc validate requires a file path"] };
      let content: unknown;
      try {
        content = JSON.parse(readFileSync(file, "utf8"));
      } catch (cause) {
        return { code: 2, output: [`error: cannot read ${file}: ${cause instanceof Error ? cause.message : cause}`] };
      }
      const result = parseWDLDocument(content, file);
      const errors = result.diagnostics.filter((d) => d.severity === "error");
      const output = [
        ...result.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}${d.sourceRef?.path ? ` at ${d.sourceRef.path}` : ""}`),
        errors.length === 0 ? `valid: ${file}` : `invalid: ${file} (${errors.length} error(s))`
      ];
      return {
        code: errors.length === 0 ? 0 : 1,
        output,
        ...(json ? { json: { valid: errors.length === 0, diagnostics: result.diagnostics } } : {})
      };
    }

    case "compile": {
      const file = args[0];
      if (!file) return { code: 2, output: ["error: roc compile requires a file path"] };
      let content: Record<string, unknown>;
      try {
        content = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      } catch (cause) {
        return { code: 2, output: [`error: cannot read ${file}: ${cause instanceof Error ? cause.message : cause}`] };
      }
      const result = await compileWorld({
        source: { id: file, format: "wdl", content }
      });
      const output = [
        ...result.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
        result.success
          ? `compiled: ${result.executableWorld?.worldId} (${result.executableWorld?.graph.entitiesById.size} entities, snapshot ${result.executableWorld?.initialSnapshotId})`
          : `compile failed: ${file}`
      ];
      return {
        code: result.success ? 0 : 1,
        output,
        ...(json
          ? {
              json: {
                success: result.success,
                worldId: result.executableWorld?.worldId,
                initialSnapshotId: result.executableWorld?.initialSnapshotId,
                diagnostics: result.diagnostics
              }
            }
          : {})
      };
    }

    case "help":
    case undefined:
      return { code: command === "help" ? 0 : 2, output: USAGE };

    default:
      return { code: 2, output: [`error: unknown command "${command}"`, ...USAGE] };
  }
}
