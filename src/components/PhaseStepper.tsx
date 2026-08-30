import { PHASES, PHASE_LABELS, PhaseState } from "@/lib/types";

export function PhaseStepper({ phaseState }: { phaseState: PhaseState }) {
  return (
    <aside className="w-64 shrink-0 border-r border-bb-border-subtle bg-bb-panel px-5 py-6 overflow-y-auto">
      <div className="mb-5 text-xs font-semibold tracking-widest text-bb-text-tertiary">
        PRD PROGRESS
      </div>
      <ol className="relative">
        {PHASES.map((phase, i) => {
          const isCompleted = phaseState.completed.includes(phase);
          const isActive = phaseState.current === phase;
          const isLast = i === PHASES.length - 1;
          return (
            <li key={phase} className="relative flex gap-3 pb-6 last:pb-0">
              {!isLast && (
                <span
                  className="absolute left-[11px] top-6 h-full w-px"
                  style={{
                    backgroundColor: isCompleted ? "var(--bb-red)" : "var(--bb-border)",
                  }}
                />
              )}
              <span
                className={`z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] ${
                  isCompleted
                    ? "bg-bb-red text-white"
                    : isActive
                      ? "border-2 border-bb-red bg-bb-bg"
                      : "border border-bb-border bg-bb-bg"
                }`}
              >
                {isCompleted ? (
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8.5l3 3 7-7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : isActive ? (
                  <span className="h-2 w-2 rounded-full bg-bb-red" />
                ) : null}
              </span>
              <span
                className={`text-sm leading-[22px] ${
                  isActive
                    ? "font-semibold text-bb-text"
                    : isCompleted
                      ? "text-bb-text"
                      : "text-bb-text-tertiary"
                }`}
              >
                {PHASE_LABELS[phase]}
              </span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
