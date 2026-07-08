/**
 * Application expression of one projected entity.
 *
 * The renderer owns placement, order, motion, and interaction gating; this
 * component owns paint. Aspect data comes from the permission-aware devtools
 * inspector, so redaction is visible instead of silent (TOOL-2100.020), and
 * every affordance goes through the surface's gated `emit` — nothing here
 * can touch the runtime.
 */
import type { SLIEntityRenderContext } from "@sli/renderer-react";
import type { EntityInspection } from "@roc/devtools";
import type { StudioState, WorldStudioOS } from "../studio/os";

const TYPE_GLYPHS: Record<string, string> = {
  household: "🏠",
  person: "👤",
  closet: "🗄️",
  garment: "🧥",
  weather: "🌦️",
  event: "💍",
  bird: "🐦",
  outfit_plan: "🧵",
  "wge.objective": "🎯"
};

function aspectChips(inspection: EntityInspection, expanded: boolean): React.ReactNode {
  const aspects = expanded ? inspection.aspects : inspection.aspects.slice(0, 2);
  return (
    <ul className="aspect-list">
      {aspects.map((aspect) => (
        <li key={aspect.kind} className="aspect">
          <span className="aspect-kind">{aspect.kind}</span>
          <span className="aspect-fields">
            {(expanded ? aspect.fields : aspect.fields.slice(0, 3)).map((field) => (
              <span
                key={field.name}
                className={`aspect-field${field.redacted ? " redacted" : ""}`}
                title={field.redacted ? field.redactionReason : `${field.name}`}
              >
                {field.redacted ? (
                  <>
                    <span aria-hidden="true">🔒</span> {field.name}: «redacted»
                  </>
                ) : (
                  `${field.name}: ${formatValue(field.value)}`
                )}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

export function EntityContent(props: {
  os: WorldStudioOS;
  state: StudioState;
  context: SLIEntityRenderContext;
}): React.ReactNode {
  const { os, state, context } = props;
  const { instruction, accessibilityNode, interaction, emit } = context;
  const entityId = instruction.entityId;
  const inspection = state.worldInspection?.entities.find((e) => e.entityId === entityId);
  const composed = state.projection?.composition.entities.find((e) => e.entityId === entityId);
  const expanded = state.expandedEntityIds.includes(entityId);
  const selected = state.selectedEntityId === entityId;
  const glyph = TYPE_GLYPHS[inspection?.type ?? ""] ?? "◆";
  const can = (type: Parameters<typeof emit>[0]): boolean =>
    interaction?.allowedInteractions.includes(type) ?? false;

  const status = inspection?.aspects
    .find((a) => a.kind === "state")
    ?.fields.find((f) => f.name === "status" && !f.redacted)?.value as string | undefined;

  return (
    <article
      className={`entity-card role-${instruction.projectionRole}${selected ? " selected" : ""}`}
      data-entity-type={inspection?.type ?? "unknown"}
    >
      <header className="entity-head">
        <span className="entity-glyph" aria-hidden="true">
          {glyph}
        </span>
        <span className="entity-label">{accessibilityNode?.label ?? entityId}</span>
        {status && <span className={`status-chip status-${status}`}>{status}</span>}
        {inspection && inspection.redactionCount > 0 && (
          <span className="redaction-chip" title="Protected details redacted for this actor (TOOL-2100.020)">
            🔒 {inspection.redactionCount}
          </span>
        )}
      </header>

      {composed && (
        <div className="entity-meters" aria-hidden="true">
          <span
            className="meter relevance"
            title={`relevance ${composed.relevance.toFixed(2)} (${composed.relevanceSource ?? "unknown"})`}
          >
            <span style={{ width: `${Math.min(1, composed.relevance) * 100}%` }} />
          </span>
          <span className="meter confidence" title={`confidence ${composed.confidence.toFixed(2)}`}>
            <span style={{ width: `${Math.min(1, composed.confidence) * 100}%` }} />
          </span>
        </div>
      )}

      {inspection && instruction.projectionRole !== "ambient" && aspectChips(inspection, expanded)}

      <footer className="entity-actions">
        {can("inspect") && (
          <button
            type="button"
            className="entity-action"
            onClick={(event) => {
              event.stopPropagation();
              emit("inspect");
            }}
          >
            inspect
          </button>
        )}
        {can(expanded ? "collapse" : "expand") && instruction.projectionRole !== "ambient" && (
          <button
            type="button"
            className="entity-action"
            onClick={(event) => {
              event.stopPropagation();
              emit(expanded ? "collapse" : "expand");
            }}
          >
            {expanded ? "collapse" : "expand"}
          </button>
        )}
        {can("compare") && state.branch.kind === "candidate" && (
          <button
            type="button"
            className="entity-action"
            onClick={(event) => {
              event.stopPropagation();
              emit("compare");
            }}
          >
            compare
          </button>
        )}
        <button
          type="button"
          className="entity-action why"
          onClick={(event) => {
            event.stopPropagation();
            os.setSurfaces({ explanation: os.explain(entityId) });
          }}
        >
          why?
        </button>
      </footer>
    </article>
  );
}
