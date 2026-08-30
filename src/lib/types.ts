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

export interface ChatTurnRequest {
  messages: ChatMessage[];
  phaseState: PhaseState;
}

export interface ChatTurnResponse {
  reply: string;
  phaseState: PhaseState;
  savedPrd?: { title: string; path: string };
}
