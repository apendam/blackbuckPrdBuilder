export type Role = "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

export const PHASES = [
  "objective",
  "problem_statement",
  "sizing",
  "scope",
  "context_loading",
  "skeleton_draft",
  "skeleton_revision",
  "full_prd",
  "output",
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  objective: "Objective",
  problem_statement: "Problem Statement",
  sizing: "Sizing",
  scope: "Scope",
  context_loading: "Context Loading",
  skeleton_draft: "Skeleton Draft",
  skeleton_revision: "Skeleton Revision",
  full_prd: "Full PRD",
  output: "Output",
};

export interface PhaseState {
  current: Phase;
  completed: Phase[];
}

export const INITIAL_PHASE_STATE: PhaseState = {
  current: "objective",
  completed: [],
};

// Matches SKILL.md's Phase 4 vertical list and filename mapping table exactly.
export const VERTICALS = [
  "Sales",
  "Toll",
  "Fuel",
  "TZF",
  "Payments",
  "GPS",
  "Supply",
  "Load Board",
  "Finserve",
  "Frontend",
  "Android",
  "BB Pro",
] as const;

export type Vertical = (typeof VERTICALS)[number];

// Matches SKILL.md's "Vertical filename mapping" table exactly.
export const VERTICAL_FILENAMES: Record<Vertical, string> = {
  Sales: "sales.md",
  Toll: "toll.md",
  Fuel: "fuel.md",
  TZF: "tzf.md",
  Payments: "payments.md",
  GPS: "gps.md",
  Supply: "supply.md",
  "Load Board": "load-board.md",
  Finserve: "finserve.md",
  Frontend: "frontend.md",
  Android: "android.md",
  "BB Pro": "bb-pro.md",
};

export interface PhaseLogEntry {
  phase: Phase;
  at: string; // ISO timestamp
}

export interface ChatTurnRequest {
  conversationId: string;
  message: string;
}

export interface ChatTurnResponse {
  reply: string;
  phaseState: PhaseState;
  title?: string;
  savedPrd?: { path: string };
  googleDocUrl?: string;
}
