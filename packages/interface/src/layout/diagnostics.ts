/**
 * Layout diagnostics — every displacement, collapse, and intentional overlap
 * is recorded. Nothing moves silently (development mode logs; production
 * keeps the record for devtools).
 */

export interface RALayoutDiagnostic {
  code:
    | "RA_LAYOUT_DISPLACED"
    | "RA_LAYOUT_COLLAPSED"
    | "RA_LAYOUT_INTENTIONAL_OVERLAP"
    | "RA_LAYOUT_UNDECLARED_OVERLAP"
    | "RA_LAYOUT_INVALID_OBJECT";
  objectId: string;
  otherId?: string;
  reason: string;
}

export interface RALayoutDiagnosticsSink {
  (diagnostic: RALayoutDiagnostic): void;
}

/** Dev-mode console sink; renderers may substitute their own. */
export const devDiagnosticsSink: RALayoutDiagnosticsSink = (diagnostic) => {
  console.warn(`[rl-layout] ${diagnostic.code} ${diagnostic.objectId}: ${diagnostic.reason}`);
};
