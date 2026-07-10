/**
 * Layout diagnostics — every displacement, collapse, and intentional overlap
 * is recorded. Nothing moves silently (development mode logs; production
 * keeps the record for devtools).
 */

export interface RLLayoutDiagnostic {
  code:
    | "RL_LAYOUT_DISPLACED"
    | "RL_LAYOUT_COLLAPSED"
    | "RL_LAYOUT_INTENTIONAL_OVERLAP"
    | "RL_LAYOUT_UNDECLARED_OVERLAP"
    | "RL_LAYOUT_INVALID_OBJECT";
  objectId: string;
  otherId?: string;
  reason: string;
}

export interface RLLayoutDiagnosticsSink {
  (diagnostic: RLLayoutDiagnostic): void;
}

/** Dev-mode console sink; renderers may substitute their own. */
export const devDiagnosticsSink: RLLayoutDiagnosticsSink = (diagnostic) => {
  console.warn(`[rl-layout] ${diagnostic.code} ${diagnostic.objectId}: ${diagnostic.reason}`);
};
