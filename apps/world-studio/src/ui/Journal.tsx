/**
 * The causality ledger (south region, SLI-1600.002: history and reflection).
 *
 * Every outcome, law application, projection, and interaction lands here
 * with its trace one click away — the demo invariant made ambient
 * (REF-1900.019: the system must answer what/why/who).
 */
import type { ReactNode } from "react";
import type { StudioState, WorldStudioOS } from "../studio/os";

const KIND_GLYPHS: Record<string, string> = {
  system: "◈",
  outcome: "⚙",
  interaction: "☞",
  projection: "▤",
  law: "§"
};

export function Journal(props: { os: WorldStudioOS; state: StudioState }): ReactNode {
  const { os, state } = props;
  const entries = [...state.journal].reverse().slice(0, 40);

  return (
    <footer className="chrome chrome-south" aria-label="Causality journal">
      {state.answers && (
        <div className="answers" role="region" aria-label="The six demo questions">
          <h2>The system answers</h2>
          <dl>
            {Object.entries(state.answers).map(([question, answer]) => (
              <div key={question} className="answer">
                <dt>{question}</dt>
                <dd>{answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <ol className="journal" aria-label="Ledger, newest first">
        {entries.map((entry) => (
          <li key={entry.id} className={`journal-entry kind-${entry.kind} status-${entry.status ?? "none"}`}>
            <span className="journal-glyph" aria-hidden="true">
              {KIND_GLYPHS[entry.kind] ?? "·"}
            </span>
            <span className="journal-title">{entry.title}</span>
            {entry.detail && <span className="journal-detail">{entry.detail}</span>}
            {entry.traceId && (
              <button
                type="button"
                className="journal-trace"
                onClick={() => os.openTrace(entry.traceId ?? "")}
                title="Open the runtime trace"
              >
                trace
              </button>
            )}
          </li>
        ))}
      </ol>
    </footer>
  );
}
